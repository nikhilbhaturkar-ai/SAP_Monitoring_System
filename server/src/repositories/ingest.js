/**
 * Write path shared by every data source: the Excel importer and the scheduled
 * SAP collector both land here, so parsing and anomaly detection stay identical
 * no matter where a reading came from.
 *
 * Anomaly detection remains data-driven — a check is flagged when its value
 * stops containing `checks.normal_text`, so retuning is an UPDATE, never a
 * code change.
 */
import { pool } from '../db.js';
import { parseVolume, isAnomaly } from '../lib/metrics.js';

/** Reference data keyed for fast lookup during ingest. */
export async function loadReferenceData() {
  const [{ rows: systems }, { rows: checks }] = await Promise.all([
    pool.query('SELECT id, sid, kind FROM systems'),
    pool.query('SELECT key, normal_text, is_info, is_volume FROM checks'),
  ]);

  const systemsBySid = new Map(systems.map((s) => [s.sid, s]));
  const checksByKey = new Map(checks.map((c) => [c.key, c]));

  if (systemsBySid.size === 0 || checksByKey.size === 0) {
    throw new Error('reference data missing — run `npm run migrate` first');
  }
  return { systems, systemsBySid, checksByKey };
}

/**
 * Upsert the run header and return its id.
 *
 * `run_at` is the natural key (paired with `source`): the Excel importer passes
 * midnight so re-imports keep updating the same row, while the collector passes
 * the actual poll time so each 15-minute cycle gets its own run.
 */
export async function openRun(client, { runDate, runAt, source }) {
  const { rows } = await client.query(
    `INSERT INTO monitoring_runs (run_date, run_at, source)
     VALUES ($1, $2, $3)
     ON CONFLICT (run_at, source) DO UPDATE SET imported_at = now()
     RETURNING id`,
    [runDate, runAt, source]
  );
  return rows[0].id;
}

/**
 * Upsert one observation, parsing volumes and flagging anomalies on the way in
 * so trend queries stay pure SQL. Returns true when the value was anomalous.
 */
export async function writeObservation(client, { runId, systemId, check, rawValue }) {
  const volume = check.is_volume ? parseVolume(rawValue) : null;
  const anomaly = isAnomaly(check, rawValue);

  await client.query(
    `INSERT INTO observations
       (run_id, system_id, check_key, raw_value, used_gb, total_gb, free_gb, is_anomaly)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (run_id, system_id, check_key) DO UPDATE
       SET raw_value  = EXCLUDED.raw_value,
           used_gb    = EXCLUDED.used_gb,
           total_gb   = EXCLUDED.total_gb,
           free_gb    = EXCLUDED.free_gb,
           is_anomaly = EXCLUDED.is_anomaly`,
    [
      runId,
      systemId,
      check.key,
      rawValue,
      volume?.usedGB ?? null,
      volume?.totalGB ?? null,
      volume?.freeGB ?? null,
      anomaly,
    ]
  );

  return anomaly;
}

/**
 * Replace every row for one (run, system) in a detail table with a fresh set.
 * Shared plumbing behind writeDumpDetails / writeBackupLogDetails /
 * writeLockDetails / writeServerDetails below — each owns its table name and
 * column list, this just builds the delete + multi-row insert.
 *
 * Delete-then-insert rather than an upsert: these rows carry no natural key
 * (SAP doesn't hand back a row id we can rely on for identity), so "safe to
 * re-run" here means the same run_id always ends up holding exactly the rows
 * from its most recent poll, not an accumulation of duplicates.
 */
async function replaceDetailRows(client, { table, columns, runId, systemId, rows, toParams }) {
  await client.query(`DELETE FROM ${table} WHERE run_id = $1 AND system_id = $2`, [
    runId,
    systemId,
  ]);

  if (!rows || rows.length === 0) return;

  const width = columns.length;
  const values = rows
    .map((_, i) => {
      const base = i * width;
      const placeholders = columns.map((_, j) => `$${base + j + 1}`).join(', ');
      return `(${placeholders})`;
    })
    .join(', ');

  const params = rows.flatMap((row) => toParams(row, runId, systemId));

  await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values}`, params);
}

const DUMP_COLUMNS = [
  'run_id',
  'system_id',
  'dump_date',
  'dump_time',
  'host',
  'sap_user',
  'dump_id',
  'program_name',
  'include_name',
  'line_number',
];

/** st22's runtime-error dumps. checkKey guards against a call for any other check. */
export async function writeDumpDetails(client, { runId, systemId, checkKey, dumps }) {
  if (checkKey !== 'st22') return;
  await replaceDetailRows(client, {
    table: 'st22_dumps',
    columns: DUMP_COLUMNS,
    runId,
    systemId,
    rows: dumps,
    toParams: (d, r, s) => [
      r,
      s,
      d.dumpDate,
      d.dumpTime,
      d.host,
      d.sapUser,
      d.dumpId,
      d.programName,
      d.includeName,
      d.lineNumber,
    ],
  });
}

const BACKUP_LOG_COLUMNS = [
  'run_id',
  'system_id',
  'entry_type',
  'entry_start',
  'entry_end',
  'entry_state',
  'entry_comment',
];

/** backup's BACKUP_LOG history. */
export async function writeBackupLogDetails(client, { runId, systemId, checkKey, entries }) {
  if (checkKey !== 'backup') return;
  await replaceDetailRows(client, {
    table: 'backup_log',
    columns: BACKUP_LOG_COLUMNS,
    runId,
    systemId,
    rows: entries,
    toParams: (e, r, s) => [
      r,
      s,
      e.entryType,
      e.entryStart,
      e.entryEnd,
      e.entryState,
      e.entryComment,
    ],
  });
}

const LOCK_COLUMNS = [
  'run_id',
  'system_id',
  'lock_user',
  'table_name',
  'lock_mode',
  'lock_time',
  'duration_hrs',
];

/** sm12's LOCK_ENTRIES. */
export async function writeLockDetails(client, { runId, systemId, checkKey, locks }) {
  if (checkKey !== 'sm12') return;
  await replaceDetailRows(client, {
    table: 'sm12_locks',
    columns: LOCK_COLUMNS,
    runId,
    systemId,
    rows: locks,
    toParams: (l, r, s) => [
      r,
      s,
      l.lockUser,
      l.tableName,
      l.lockMode,
      l.lockTime,
      l.durationHrs,
    ],
  });
}

const SERVER_COLUMNS = ['run_id', 'system_id', 'server_name', 'host', 'host_long', 'host_addr'];

/** sm51's SERVER_LIST. */
export async function writeServerDetails(client, { runId, systemId, checkKey, servers }) {
  if (checkKey !== 'sm51') return;
  await replaceDetailRows(client, {
    table: 'sm51_servers',
    columns: SERVER_COLUMNS,
    runId,
    systemId,
    rows: servers,
    toParams: (srv, r, s) => [r, s, srv.serverName, srv.host, srv.hostLong, srv.hostAddr],
  });
}

const WORKER_COLUMNS = [
  'run_id',
  'system_id',
  'wp_index',
  'wp_type',
  'wp_status',
  'wp_info',
  'server_name',
  'wp_user',
  'wp_program',
  'wp_cpu',
];

/** sm50's WORKER_LIST_DISP. */
export async function writeWorkerDetails(client, { runId, systemId, checkKey, workers }) {
  if (checkKey !== 'sm50') return;
  await replaceDetailRows(client, {
    table: 'sm50_workers',
    columns: WORKER_COLUMNS,
    runId,
    systemId,
    rows: workers,
    toParams: (w, r, s) => [
      r,
      s,
      w.wpIndex,
      w.wpType,
      w.wpStatus,
      w.wpInfo,
      w.serverName,
      w.wpUser,
      w.wpProgram,
      w.wpCpu,
    ],
  });
}
