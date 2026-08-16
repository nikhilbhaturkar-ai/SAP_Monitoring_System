/**
 * SAP API response → the free-text value the rest of the pipeline already
 * understands. Mapping here rather than in the database means nothing
 * downstream changes when the real API arrives.
 *
 * The contract each mapper must honour:
 *
 *   Volume checks (dataVol, logVol, freeApp, freeDb)
 *     Return either shape — both are parsed by parseVolume() in lib/metrics.js:
 *       "224.75 GB /2.91 TB"             → used / total
 *       "Total: 107GB / Free: 43 GB"     → total / free
 *
 *   Count checks (st22, sm12)
 *     Return the count as a plain numeric string ("0", "2", …). normal_text is
 *     itself numeric ("0"), so isAnomaly() compares by value rather than by
 *     substring — see lib/metrics.js.
 *
 *   Status checks (backup, sm13, sm51, …)
 *     Return text that CONTAINS the check's `checks.normal_text` when healthy,
 *     and something else when not. isAnomaly() does a case-insensitive
 *     substring test — see db/seed.sql for each normal_text.
 *     e.g. backup healthy → "Backup successful", sm13 healthy → contains
 *     "active" (the API's own wording, "Update is Active", passes through
 *     verbatim), sm51 healthy → "Active".
 *
 *   urlStatus
 *     normal_text is "accessable" (the spelling the Basis team's workbook
 *     uses). Return text containing it when the endpoint is up; the tile
 *     renderer matches /accessable|accessible/i (routes/api.js).
 *
 * Returning null means "no reading this cycle" — the collector skips writing
 * that observation rather than storing a blank.
 *
 * Four checks (st22, backup, sm12, sm51) also carry a list-of-rows detail
 * behind their headline value — toDumpDetails / toBackupLogDetails /
 * toLockDetails / toServerDetails below, one per check, each writing to its
 * own table (st22_dumps / backup_log / sm12_locks / sm51_servers). Every
 * other check here is still a placeholder returning null until its real
 * response shape is known.
 */

/**
 * @param {string} checkKey  a `checks.key` value
 * @param {unknown} payload  parsed JSON (or raw text) from the SAP API
 * @returns {string|null}    the raw value to store, or null to skip
 */
export function toRawValue(checkKey, payload) {
  switch (checkKey) {
    // --- DBA Cockpit volumes -------------------------------------------------
    case 'dataVol': {
      // Z_DATA_VOL_SRV: { PERSPECTIVE, TARGET, USED_GB, LIMIT_GB }. LIMIT_GB is
      // the ceiling, i.e. the "total" parseVolume() expects in "used / total".
      const used = Number(payload?.USED_GB);
      const limit = Number(payload?.LIMIT_GB);
      if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
      return `${used} GB /${limit} GB`;
    }

    case 'logVol': {
      // Z_LOG_VOL_SRV: array of { METRIC_NAME, SIZE_GB }. The host disk pair
      // (not "Active Log Volume Size", which is the current log file, not a
      // capacity) gives the used/total shape parseVolume() expects.
      const metrics = Array.isArray(payload) ? payload : [];
      const findGb = (name) => metrics.find((m) => m?.METRIC_NAME === name)?.SIZE_GB;
      const total = Number(findGb('Total Host Disk Size (Log Path)'));
      const free = Number(findGb('Free Host Disk Space (Log Path)'));
      if (!Number.isFinite(total) || !Number.isFinite(free)) return null;
      return `Total: ${total} GB / Free: ${free} GB`;
    }

    // --- OS free space -------------------------------------------------------
    case 'freeApp':
    case 'freeDb':
      // TODO(SAP): e.g. `Total: ${payload.totalGB}GB / Free: ${payload.freeGB} GB`
      return null;

    // --- Transaction-code checks --------------------------------------------
    case 'st22':
      // Z_ST22_ERR_SRV: an array of dump rows, one per runtime error in the
      // lookback window the service applies. The tile shows the count; the
      // rows themselves are separately captured by toDumpDetails() below.
      return Array.isArray(payload) ? String(payload.length) : null;

    case 'backup':
      // Z_BACKUP_SRV: { BACKUP_STATUS, BACKUP_LOG: [...] }. BACKUP_STATUS is
      // SAP's own rollup of the log, so it is trusted as-is rather than
      // recomputed from BACKUP_LOG here — the log is captured separately by
      // toDetailRows() for the click-through table.
      return typeof payload?.BACKUP_STATUS === 'string' && payload.BACKUP_STATUS.trim() !== ''
        ? `Backup ${payload.BACKUP_STATUS}`
        : null;

    case 'sm13':
      // Z_SM13_UPD_SRV: a bare quoted string, e.g. "Update is Active".
      return typeof payload === 'string' && payload.trim() !== '' ? payload : null;

    case 'sm12':
      // Z_SM12_LOCK_SRV: { LV_LOCKS_GT_12_HRS, LOCK_ENTRIES: [...] }. The tile
      // shows the raw active-lock count (LOCK_ENTRIES.length) so the number on
      // screen matches the table behind it. LV_LOCKS_GT_12_HRS is ignored for
      // now — the >12h signal isn't used to flag anomalies at this time.
      return Array.isArray(payload?.LOCK_ENTRIES) ? String(payload.LOCK_ENTRIES.length) : null;

    case 'sm51': {
      // Z_SM51_STATESRV: { STATE, SERVER_LIST: [...] }. STATE is the overall
      // server status text; SERVER_LIST is captured separately for detail.
      const state = payload?.STATE;
      return typeof state === 'string' && state.trim() !== '' ? state : null;
    }

    case 'sm50':
      // Z_SM50_WP_SRV: { WP_GT_THRESHOLD, WORKER_LIST_DISP: [...] }.
      // WP_GT_THRESHOLD is SAP's own count of work processes running past the
      // long-running threshold (100000s) — 0 is healthy, anything else names
      // the count so the reading is self-explanatory without opening the
      // dialog. WORKER_LIST_DISP itself is still captured in full by
      // toWorkerDetails() below for the click-through table.
      {
        const overThreshold = Number(payload?.WP_GT_THRESHOLD);
        if (!Number.isFinite(overThreshold)) return null;
        return overThreshold === 0
          ? 'All Ok'
          : `Count of WPs running for more than 100000 seconds = ${overThreshold}`;
      }

    case 'st06':
    case 'sm37':
    case 'smq1':
    case 'smq2':
    case 'sm20':
    case 'sm21':
    case 'sm58':
      // TODO(SAP): map the API result to text containing the check's
      // normal_text when healthy.
      return null;

    // --- Endpoint reachability ----------------------------------------------
    case 'urlStatus':
      // TODO(SAP): e.g. payload.up ? 'Accessable' : 'Not reachable'
      return null;

    default:
      return null;
  }
}

/**
 * Dump-level detail for checks whose count hides a list. Only st22 has one
 * today. Returns `[]` for "checked, nothing found" and `null` for "this check
 * has no such detail" or a shape that didn't parse — the collector only
 * writes rows for an array, so `null` and `[]` both leave the table untouched
 * for this run, which is correct: no dumps happened, nothing to record.
 *
 * @param {string} checkKey
 * @param {unknown} payload  the same payload passed to toRawValue()
 * @returns {Array<object>|null}
 */
export function toDumpDetails(checkKey, payload) {
  if (checkKey !== 'st22') return null;
  if (!Array.isArray(payload)) return null;

  return payload.map((row) => ({
    dumpDate: row?.SYDATE ?? null,
    dumpTime: row?.SYTIME ?? null,
    host: row?.SYHOST ?? null,
    sapUser: row?.SYUSER ?? null,
    dumpId: row?.DUMPID ?? null,
    programName: row?.PROGRAMNAME ?? null,
    includeName: row?.INCLUDENAME ?? null,
    lineNumber: row?.LINENUMBER != null ? String(row.LINENUMBER) : null,
  }));
}

/**
 * "START_TIME"/"END_TIME" arrive as "YYYY-MM-DD HH:MM:SS" with no timezone —
 * Postgres TIMESTAMP (not TIMESTAMPTZ) stores that literally, so this only
 * has to reject garbage, not convert a zone.
 */
function toTimestampOrNull(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value
    : null;
}

/**
 * Backup log entries behind a backup observation's status.
 * Z_BACKUP_SRV: { BACKUP_STATUS, BACKUP_LOG: [{ ENTRY_TYPE, START_TIME,
 * END_TIME, STATE, COMMENT }] }.
 *
 * @returns {Array<object>|null}
 */
export function toBackupLogDetails(checkKey, payload) {
  if (checkKey !== 'backup') return null;
  const log = payload?.BACKUP_LOG;
  if (!Array.isArray(log)) return null;

  return log.map((row) => ({
    entryType: row?.ENTRY_TYPE ?? null,
    entryStart: toTimestampOrNull(row?.START_TIME),
    entryEnd: toTimestampOrNull(row?.END_TIME),
    entryState: row?.STATE ?? null,
    entryComment: row?.COMMENT || null,
  }));
}

/**
 * Lock entries behind an sm12 observation's ">12h" count.
 * Z_SM12_LOCK_SRV: { LV_LOCKS_GT_12_HRS, LOCK_ENTRIES: [...] }. Each entry is
 * SAP's standard enqueue structure (SEQG3): GNAME (lock object), GARG (the
 * locked key), GMODE (E = exclusive, S = shared, …), GUNAME (the user holding
 * it), GOBJ (object type), GTDATE/GTTIME (when it was set). Observed directly
 * against the live MSD endpoint — GUSR is a padded internal token, not the
 * readable user name, which is GUNAME instead.
 *
 * No duration field is returned per entry, and the service already computes
 * LV_LOCKS_GT_12_HRS itself (used for the tile's count in toRawValue above),
 * so durationHrs is left null here rather than recomputed from GTDATE/GTTIME
 * against the poll time, which would silently disagree with SAP's own count
 * whenever the two clocks or definitions of "12 hours" don't line up exactly.
 *
 * @returns {Array<object>|null}
 */
export function toLockDetails(checkKey, payload) {
  if (checkKey !== 'sm12') return null;
  const entries = payload?.LOCK_ENTRIES;
  if (!Array.isArray(entries)) return null;

  return entries.map((row) => ({
    lockUser: row?.GUNAME ?? null,
    tableName: row?.GNAME ?? null,
    lockMode: row?.GMODE ?? null,
    lockTime:
      row?.GTDATE && row?.GTTIME
        ? `${row.GTDATE} ${row.GTTIME}`
        : (row?.GTDATE ?? row?.GTTIME ?? null),
    durationHrs: null,
  }));
}

/**
 * Application server list behind an sm51 observation's overall STATE.
 * Z_SM51_STATESRV: { STATE, SERVER_LIST: [{ NAME, HOST, HOSTNAMELONG,
 * HOSTADDR_V4_STR, … }] }.
 *
 * Only the plain-text fields are kept. The response also carries several
 * base64-encoded raw ABAP structure bytes (MSGTYPES, HOSTADR, SERVNO, STATE,
 * SYSSERVICE0-3) — decoding HOSTADR confirms it is just the same IPv4 address
 * already given in HOSTADDR_V4_STR as plain text, so those fields duplicate
 * data already present and are not decoded or stored.
 *
 * @returns {Array<object>|null}
 */
export function toServerDetails(checkKey, payload) {
  if (checkKey !== 'sm51') return null;
  const servers = payload?.SERVER_LIST;
  if (!Array.isArray(servers)) return null;

  return servers.map((row) => ({
    serverName: row?.NAME ?? null,
    host: row?.HOST ?? null,
    hostLong: row?.HOSTNAMELONG ?? null,
    hostAddr: row?.HOSTADDR_V4_STR ?? null,
  }));
}

/**
 * Work process list behind an sm50 observation's headline count.
 * Z_SM50_WP_SRV: { WP_GT_THRESHOLD, WORKER_LIST_DISP: [{ WP_INDEX, WP_TYPE_DISP,
 * STATE_DISP, STATE_INFO_DISP, SERVER_NAME, USER_NAME, WP_PROGRAM,
 * MAIN_PROGRAM, CPU, … }] }.
 *
 * WP_PROGRAM is blank for idle work processes; MAIN_PROGRAM is the fallback
 * so an active worker's program still shows (observed against the live MSD
 * endpoint: WP_INDEX 11 carries WP_PROGRAM, but 12/13 only carry
 * MAIN_PROGRAM). The many handle/session bookkeeping fields (LOGON_HDL,
 * SESSION_HDL, SESSION_KEY, PRIORITY, …) aren't meaningful outside SAP's own
 * UI and are not stored.
 *
 * @returns {Array<object>|null}
 */
export function toWorkerDetails(checkKey, payload) {
  if (checkKey !== 'sm50') return null;
  const workers = payload?.WORKER_LIST_DISP;
  if (!Array.isArray(workers)) return null;

  return workers.map((row) => ({
    wpIndex: row?.WP_INDEX != null ? String(row.WP_INDEX) : null,
    wpType: row?.WP_TYPE_DISP ?? null,
    wpStatus: row?.STATE_DISP ?? null,
    wpInfo: row?.STATE_INFO_DISP || null,
    serverName: row?.SERVER_NAME ?? null,
    wpUser: row?.USER_NAME || null,
    wpProgram: row?.WP_PROGRAM || row?.MAIN_PROGRAM || null,
    wpCpu: row?.CPU ?? null,
  }));
}
