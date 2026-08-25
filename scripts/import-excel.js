/**
 * ETL: "ERP Monitoring Log.xlsx" → PostgreSQL.
 *
 * Workbook shape (per sheet):
 *   - Up to two header rows ("DATE | SID | DBA Cockpit | ..." then a sub-header
 *     row carrying "Data Volumes" / "Log Volumes" / "SM21").
 *   - One block of rows per calendar day. The DATE cell is merged over the block,
 *     so only the first row of each block carries it — later rows inherit it.
 *   - Each block holds the three SAP systems (MSP, MGP, SPA) plus three URL
 *     endpoints whose availability sits in the "DBA Cockpit" column.
 *
 * Re-running is safe: runs and observations upsert on their natural keys.
 */
import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../lib/server/db.js';
import { config } from '../lib/server/config.js';
import { loadReferenceData, openRun, writeObservation } from '../lib/server/repositories/ingest.js';

// Column index (1-based, as ExcelJS reports) → check key, for SAP system rows.
const SAP_COLUMNS = {
  3: 'dataVol',
  4: 'logVol',
  5: 'st22',
  6: 'backup',
  7: 'sm13',
  8: 'sm12',
  9: 'sm51',
  10: 'sm50',
  11: 'st06',
  12: 'sm37',
  13: 'smq1',
  14: 'smq2',
  15: 'sm20',
  16: 'sm21',
  17: 'sm58',
  18: 'freeApp',
  19: 'freeDb',
};

// URL rows only carry availability (col 3) and occasionally an app-memory reading.
const URL_COLUMNS = { 3: 'urlStatus', 18: 'freeApp' };

// The SID cell for endpoints holds "<LABEL>\n<url>"; match on the label prefix.
const SID_ALIASES = [
  [/^MSP\b/i, 'MSP'],
  [/^MGP\b/i, 'MGP'],
  [/^SPA\b/i, 'SPA'],
  [/^BI\s*PROD/i, 'BIPROD'],
  [/^FIORI/i, 'FIORI'],
  [/^WEB\s*DISPATCHER/i, 'WEBDISP'],
];

/** ExcelJS cells can be strings, numbers, dates, rich text or hyperlink objects. */
function cellText(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
    if (value.text != null) return String(value.text);
    if (value.result != null) return String(value.result);
    if (value.hyperlink != null) return String(value.hyperlink);
    return null;
  }
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toIsoDate(value) {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(
      value.getUTCDate()
    ).padStart(2, '0')}`;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);
  }
  return null;
}

function resolveSid(raw) {
  if (!raw) return null;
  const label = String(raw).split('\n')[0].trim();
  for (const [pattern, sid] of SID_ALIASES) {
    if (pattern.test(label)) return sid;
  }
  return null;
}

/** Walk one worksheet and emit { date, sid, values } records. */
function readSheet(worksheet) {
  const records = [];
  let currentDate = null;

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const sid = resolveSid(cellText(row.getCell(2).value));
    if (!sid) return; // header rows and stray notes

    // ExcelJS resolves merged cells to the master value, but blocks whose date
    // is simply left blank still need the carry-down.
    const dateCell = toIsoDate(cellText(row.getCell(1).value));
    if (dateCell) currentDate = dateCell;
    if (!currentDate) return;

    const columns = SAP_COLUMNS;
    const isUrlRow = ['BIPROD', 'FIORI', 'WEBDISP'].includes(sid);
    const map = isUrlRow ? URL_COLUMNS : columns;

    const values = {};
    for (const [col, key] of Object.entries(map)) {
      const text = cellText(row.getCell(Number(col)).value);
      if (text != null && !(text instanceof Date)) values[key] = String(text).trim();
    }

    if (Object.keys(values).length > 0) {
      records.push({ date: currentDate, sid, values });
    }
  });

  return records;
}

async function run() {
  console.log(`> reading ${config.excelPath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);

  const records = [];
  workbook.eachSheet((worksheet) => {
    const sheetRecords = readSheet(worksheet);
    console.log(`  · sheet "${worksheet.name}": ${sheetRecords.length} rows`);
    records.push(...sheetRecords);
  });

  if (records.length === 0) throw new Error('no monitoring rows found in workbook');

  const { systemsBySid, checksByKey } = await loadReferenceData();

  const summary = await withTransaction(async (client) => {
    const runIds = new Map();
    let observations = 0;
    let anomalies = 0;
    const skippedSystems = new Set();

    for (const record of records) {
      const system = systemsBySid.get(record.sid);
      if (!system) {
        skippedSystems.add(record.sid);
        continue;
      }

      let runId = runIds.get(record.date);
      if (!runId) {
        // Midnight of the run date is the importer's natural key, so a
        // re-import updates the same row while collector runs (which carry a
        // real poll time) sit alongside it.
        runId = await openRun(client, {
          runDate: record.date,
          runAt: `${record.date}T00:00:00Z`,
          source: 'excel',
        });
        runIds.set(record.date, runId);
      }

      for (const [checkKey, rawValue] of Object.entries(record.values)) {
        const check = checksByKey.get(checkKey);
        if (!check) continue;

        const anomaly = await writeObservation(client, {
          runId,
          systemId: system.id,
          check,
          rawValue,
        });
        if (anomaly) anomalies += 1;
        observations += 1;
      }
    }

    return { runs: runIds.size, observations, anomalies, skippedSystems: [...skippedSystems] };
  });

  console.log(
    `> imported ${summary.observations} observations across ${summary.runs} monitoring runs ` +
      `(${summary.anomalies} anomalies flagged)`
  );
  if (summary.skippedSystems.length > 0) {
    console.warn(`> skipped unknown systems: ${summary.skippedSystems.join(', ')}`);
  }
}

run()
  .catch((err) => {
    console.error('import failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
