/**
 * One SAP collection cycle: poll every system for every configured check and
 * persist the readings as a new monitoring run.
 *
 * Until real endpoints are configured in .env and src/sap/endpoints.js, every
 * fetch returns 'skipped', the cycle completes cleanly, and no monitoring run
 * is written — only a `collector_runs` audit row. That makes the whole path
 * verifiable today without inventing data.
 */
import { pool, query, withTransaction } from '../db.js';
import {
  loadReferenceData,
  openRun,
  writeObservation,
  writeDumpDetails,
  writeBackupLogDetails,
  writeLockDetails,
  writeServerDetails,
  writeWorkerDetails,
} from '../repositories/ingest.js';
import { endpointsForKind } from '../sap/endpoints.js';
import { fetchCheck } from '../sap/client.js';
import {
  toRawValue,
  toDumpDetails,
  toBackupLogDetails,
  toLockDetails,
  toServerDetails,
  toWorkerDetails,
} from '../sap/mappers.js';

/**
 * Every check that carries a list-of-rows detail behind its headline value,
 * paired with the writer that persists its rows and the argument name that
 * writer expects them under (writeDumpDetails wants `dumps`, writeLockDetails
 * wants `locks`, …, because each table's rows are named for what they are).
 * Adding a fifth such check means adding one entry here — collectSystem() and
 * the transaction below stay unchanged.
 */
const DETAIL_EXTRACTORS = {
  st22: { toRows: toDumpDetails, write: writeDumpDetails, argName: 'dumps' },
  backup: { toRows: toBackupLogDetails, write: writeBackupLogDetails, argName: 'entries' },
  sm12: { toRows: toLockDetails, write: writeLockDetails, argName: 'locks' },
  sm51: { toRows: toServerDetails, write: writeServerDetails, argName: 'servers' },
  sm50: { toRows: toWorkerDetails, write: writeWorkerDetails, argName: 'workers' },
};

// A SAP outage can make a cycle outlast its 15-minute slot; overlapping runs
// would double-write and pile up connections.
let isRunning = false;

/** Local calendar day for a Date, as the YYYY-MM-DD that run_date expects. */
function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

async function startAudit() {
  const { rows } = await query(
    `INSERT INTO collector_runs (status) VALUES ('running') RETURNING id`
  );
  return rows[0].id;
}

async function finishAudit(id, { status, attempted, succeeded, written, anomalies, errorText }) {
  await query(
    `UPDATE collector_runs
        SET finished_at = now(),
            status = $2, attempted = $3, succeeded = $4,
            written = $5, anomalies = $6, error_text = $7
      WHERE id = $1`,
    [id, status, attempted, succeeded, written, anomalies, errorText ?? null]
  );
}

/** Poll every applicable check for one system. Never rejects. */
async function collectSystem(system, checksByKey) {
  const results = [];

  // Checks run sequentially per system so a single host is not hammered,
  // while systems themselves run concurrently.
  for (const descriptor of endpointsForKind(system.kind)) {
    const check = checksByKey.get(descriptor.checkKey);
    if (!check) continue; // descriptor references a check that was never seeded

    const outcome = await fetchCheck(system, descriptor);
    if (outcome.status !== 'ok') {
      results.push({ check, outcome });
      continue;
    }

    const rawValue = toRawValue(descriptor.checkKey, outcome.payload);
    if (rawValue == null) {
      results.push({
        check,
        outcome: { status: 'skipped', reason: `no mapper implemented for ${descriptor.checkKey}` },
      });
      continue;
    }

    const extractor = DETAIL_EXTRACTORS[descriptor.checkKey];
    results.push({
      check,
      outcome: {
        status: 'ok',
        rawValue,
        detailRows: extractor ? extractor.toRows(descriptor.checkKey, outcome.payload) : null,
      },
    });
  }

  return { system, results };
}

/**
 * Run one collection cycle.
 * @returns {Promise<{status:string, attempted:number, succeeded:number, written:number, anomalies:number, skipped?:boolean}>}
 */
export async function collectOnce() {
  if (isRunning) {
    console.warn('> collection already in progress — skipping this tick');
    return { status: 'skipped', attempted: 0, succeeded: 0, written: 0, anomalies: 0 };
  }
  isRunning = true;

  const auditId = await startAudit();
  let attempted = 0;
  let succeeded = 0;
  let written = 0;
  let anomalies = 0;
  let errors = 0;

  try {
    const { systems, checksByKey } = await loadReferenceData();
    const perSystem = await Promise.all(
      systems.map((system) => collectSystem(system, checksByKey))
    );

    for (const { system, results } of perSystem) {
      const skipped = results.filter((r) => r.outcome.status === 'skipped');
      const failed = results.filter((r) => r.outcome.status === 'error');
      attempted += results.length;
      succeeded += results.filter((r) => r.outcome.status === 'ok').length;
      errors += failed.length;

      if (failed.length > 0) {
        console.warn(`> ${system.sid}: ${failed.length} check(s) failed — ${failed[0].outcome.error}`);
      }
      if (skipped.length === results.length && results.length > 0) {
        console.log(`> ${system.sid}: skipped — ${skipped[0].outcome.reason}`);
      }
    }

    if (succeeded === 0) {
      // Nothing to store. Deliberately no monitoring_runs row: an empty run
      // would show up in the dashboard's daily_runs view as that day's newest.
      const status = errors > 0 ? 'error' : 'skipped';
      console.log(`> no readings collected (${attempted} checks attempted) — nothing written`);
      await finishAudit(auditId, {
        status,
        attempted,
        succeeded,
        written,
        anomalies,
        errorText: errors > 0 ? `${errors} check(s) failed` : 'no SAP endpoints configured',
      });
      return { status, attempted, succeeded, written, anomalies };
    }

    const runAt = new Date();
    await withTransaction(async (client) => {
      const runId = await openRun(client, {
        runDate: toIsoDate(runAt),
        runAt: runAt.toISOString(),
        source: 'sap-api',
      });

      for (const { system, results } of perSystem) {
        for (const { check, outcome } of results) {
          if (outcome.status !== 'ok') continue;
          const anomaly = await writeObservation(client, {
            runId,
            systemId: system.id,
            check,
            rawValue: outcome.rawValue,
          });
          if (anomaly) anomalies += 1;
          written += 1;

          const extractor = DETAIL_EXTRACTORS[check.key];
          if (extractor && outcome.detailRows != null) {
            await extractor.write(client, {
              runId,
              systemId: system.id,
              checkKey: check.key,
              [extractor.argName]: outcome.detailRows,
            });
          }
        }
      }
    });

    const status = errors > 0 ? 'partial' : 'ok';
    console.log(
      `> collected ${written} observations from ${succeeded}/${attempted} checks ` +
        `(${anomalies} anomalies flagged)`
    );
    await finishAudit(auditId, {
      status,
      attempted,
      succeeded,
      written,
      anomalies,
      errorText: errors > 0 ? `${errors} check(s) failed` : null,
    });
    return { status, attempted, succeeded, written, anomalies };
  } catch (err) {
    await finishAudit(auditId, {
      status: 'error',
      attempted,
      succeeded,
      written,
      anomalies,
      errorText: err.message,
    });
    throw err;
  } finally {
    isRunning = false;
  }
}

/** Recent collector health, newest first — backs GET /api/collector/status. */
export async function listCollectorRuns(limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, started_at, finished_at, status, attempted, succeeded,
            written, anomalies, error_text
       FROM collector_runs
      ORDER BY started_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}
