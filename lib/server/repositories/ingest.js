/**
 * Write path for all monitoring data. The SAP collector lands here so parsing
 * and anomaly detection stay in one place.
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
 * `run_at` is the natural key (paired with `source`): the collector passes the
 * actual poll time so each 15-minute cycle gets its own distinct run row.
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

const JOB_COLUMNS = ['run_id', 'system_id', 'job_name', 'sched_date', 'sched_time'];

/** sm37's LONG_RUNNING_JOBLIST. */
export async function writeJobDetails(client, { runId, systemId, checkKey, jobs }) {
  if (checkKey !== 'sm37') return;
  await replaceDetailRows(client, {
    table: 'sm37_jobs',
    columns: JOB_COLUMNS,
    runId,
    systemId,
    rows: jobs,
    toParams: (j, r, s) => [r, s, j.jobName, j.schedDate, j.schedTime],
  });
}

const CANCEL_JOB_COLUMNS = [
  'run_id',
  'system_id',
  'job_name',
  'sched_date',
  'sched_time',
  'user_name',
  'status',
  'job_log',
  'wp_process',
  'btcsysreax',
  'reaxserver',
];

/** cancel's cancelled-job list. */
export async function writeCancelJobDetails(client, { runId, systemId, checkKey, cancelledJobs }) {
  if (checkKey !== 'cancel') return;
  await replaceDetailRows(client, {
    table: 'cancel_jobs',
    columns: CANCEL_JOB_COLUMNS,
    runId,
    systemId,
    rows: cancelledJobs,
    toParams: (j, r, s) => [
      r,
      s,
      j.jobName,
      j.schedDate,
      j.schedTime,
      j.userName,
      j.status,
      j.jobLog,
      j.wpProcess,
      j.btcsysreax,
      j.reaxserver,
    ],
  });
}

const CERT_COLUMNS = [
  'run_id',
  'system_id',
  'check_key',
  'cert_result',
  'certificate',
  'valid_from',
  'valid_to',
];

const STRUST_CHECKS = new Set(['strust', 'strustToday', 'strust15d']);

/** One of the three STRUST checks' CERT_DETAILS. Shared table, discriminated by check_key. */
export async function writeCertDetails(client, { runId, systemId, checkKey, certs }) {
  if (!STRUST_CHECKS.has(checkKey)) return;
  await client.query(
    'DELETE FROM strust_certs WHERE run_id = $1 AND system_id = $2 AND check_key = $3',
    [runId, systemId, checkKey]
  );

  if (!certs || certs.length === 0) return;

  const width = CERT_COLUMNS.length;
  const values = certs
    .map((_, i) => {
      const base = i * width;
      const placeholders = CERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(', ');
      return `(${placeholders})`;
    })
    .join(', ');
  const params = certs.flatMap((c) => [
    runId,
    systemId,
    checkKey,
    c.result,
    c.certificate,
    c.validFrom,
    c.validTo,
  ]);

  await client.query(`INSERT INTO strust_certs (${CERT_COLUMNS.join(', ')}) VALUES ${values}`, params);
}

const QUEUE_ERROR_COLUMNS = [
  'run_id',
  'system_id',
  'check_key',
  'arfcipid',
  'arfcpid',
  'queue_name',
  'destination',
  'queue_state',
  'rfc_user',
  'rfc_function',
  'rfc_date',
  'rfc_time',
  'error_message',
];

/** smq1/smq2's ERROR_QTABLE. Shared table, discriminated by check_key. */
export async function writeQueueErrorDetails(client, { runId, systemId, checkKey, errors }) {
  if (checkKey !== 'smq1' && checkKey !== 'smq2') return;
  await client.query('DELETE FROM queue_errors WHERE run_id = $1 AND system_id = $2 AND check_key = $3', [
    runId,
    systemId,
    checkKey,
  ]);

  if (!errors || errors.length === 0) return;

  const width = QUEUE_ERROR_COLUMNS.length;
  const values = errors
    .map((_, i) => {
      const base = i * width;
      const placeholders = QUEUE_ERROR_COLUMNS.map((_, j) => `$${base + j + 1}`).join(', ');
      return `(${placeholders})`;
    })
    .join(', ');
  const params = errors.flatMap((e) => [
    runId,
    systemId,
    checkKey,
    e.arfcipid,
    e.arfcpid,
    e.queueName,
    e.destination,
    e.queueState,
    e.rfcUser,
    e.rfcFunction,
    e.rfcDate,
    e.rfcTime,
    e.errorMessage,
  ]);

  await client.query(
    `INSERT INTO queue_errors (${QUEUE_ERROR_COLUMNS.join(', ')}) VALUES ${values}`,
    params
  );
}

const AUDIT_FILE_COLUMNS = [
  'run_id',
  'system_id',
  'instance_name',
  'file_name',
  'record_count',
  'record_good',
  'max_size',
  'end_reason',
  'output_text',
];

/** sm20's AUDIT_FILE. */
export async function writeAuditFileDetails(client, { runId, systemId, checkKey, files }) {
  if (checkKey !== 'sm20') return;
  await replaceDetailRows(client, {
    table: 'audit_files',
    columns: AUDIT_FILE_COLUMNS,
    runId,
    systemId,
    rows: files,
    toParams: (f, r, s) => [
      r,
      s,
      f.instanceName,
      f.fileName,
      f.recordCount,
      f.recordGood,
      f.maxSize,
      f.endReason,
      f.outputText,
    ],
  });
}

const SYSLOG_COLUMNS = [
  'run_id',
  'system_id',
  'log_date',
  'log_time',
  'instance_name',
  'priority_icon',
  'message_text',
  'slg_data',
];

/** sm21's SYSLOG_ENTRIES. */
export async function writeSyslogDetails(client, { runId, systemId, checkKey, entries }) {
  if (checkKey !== 'sm21') return;
  await replaceDetailRows(client, {
    table: 'syslog_entries',
    columns: SYSLOG_COLUMNS,
    runId,
    systemId,
    rows: entries,
    toParams: (e, r, s) => [
      r,
      s,
      e.logDate,
      e.logTime,
      e.instanceName,
      e.priorityIcon,
      e.messageText,
      e.slgData,
    ],
  });
}

const TRFC_COLUMNS = [
  'run_id',
  'system_id',
  'arfcipid',
  'arfcdest',
  'arfcfnam',
  'arfctcode',
  'arfcrhost',
  'arfcmsg',
  'arfcreserv',
  'trfc_hash',
];

/** sm58's ARFCISTATE. */
export async function writeTrfcDetails(client, { runId, systemId, checkKey, trfcs }) {
  if (checkKey !== 'sm58') return;
  await replaceDetailRows(client, {
    table: 'sm58_trfcs',
    columns: TRFC_COLUMNS,
    runId,
    systemId,
    rows: trfcs,
    toParams: (t, r, s) => [
      r,
      s,
      t.arfcipid,
      t.arfcdest,
      t.arfcfnam,
      t.arfctcode,
      t.arfcrhost,
      t.arfcmsg,
      t.arfcreserv,
      t.hash,
    ],
  });
}

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
  'wp_pid',
  'wait_priority',
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
      w.wpPid,
      w.waitPriority,
    ],
  });
}

const USER_COLUMNS = ['run_id', 'system_id', 'user_name', 'first_name', 'last_name'];

export async function writeLockedUserDetails(client, { runId, systemId, checkKey, users }) {
  if (checkKey !== 'locked') return;
  await replaceDetailRows(client, {
    table: 'locked_users',
    columns: USER_COLUMNS,
    runId,
    systemId,
    rows: users,
    toParams: (u, r, s) => [r, s, u.userName, u.firstName, u.lastName],
  });
}

export async function writeInactiveUserDetails(client, { runId, systemId, checkKey, users }) {
  if (checkKey !== 'inactive') return;
  await replaceDetailRows(client, {
    table: 'inactive_users',
    columns: USER_COLUMNS,
    runId,
    systemId,
    rows: users,
    toParams: (u, r, s) => [r, s, u.userName, u.firstName, u.lastName],
  });
}

export async function writeHighPrivUserDetails(client, { runId, systemId, checkKey, users }) {
  if (checkKey !== 'highPriv') return;
  await replaceDetailRows(client, {
    table: 'high_priv_users',
    columns: ['run_id', 'system_id', 'user_name', 'profile', 'client'],
    runId,
    systemId,
    rows: users,
    toParams: (u, r, s) => [r, s, u.userName, u.profile, u.client],
  });
}

export async function writeUnassignedRoleDetails(client, { runId, systemId, checkKey, roles }) {
  if (checkKey !== 'unassignedRoles') return;
  await replaceDetailRows(client, {
    table: 'unassigned_roles',
    columns: ['run_id', 'system_id', 'role_name'],
    runId,
    systemId,
    rows: roles,
    toParams: (r, runId, sysId) => [runId, sysId, r.roleName],
  });
}

export async function writeGhostRoleDetails(client, { runId, systemId, checkKey, roles }) {
  if (checkKey !== 'ghostRoles') return;
  await replaceDetailRows(client, {
    table: 'ghost_roles',
    columns: ['run_id', 'system_id', 'user_name', 'role_name', 'status'],
    runId,
    systemId,
    rows: roles,
    toParams: (r, runId, sysId) => [runId, sysId, r.userName, r.roleName, r.status],
  });
}

export async function writeUnusedProfileDetails(client, { runId, systemId, checkKey, profiles }) {
  if (checkKey !== 'unusedProfiles') return;
  await replaceDetailRows(client, {
    table: 'unused_profiles',
    columns: ['run_id', 'system_id', 'agr_name', 'profile'],
    runId,
    systemId,
    rows: profiles,
    toParams: (p, r, s) => [r, s, p.agrName, p.profile],
  });
}

export async function writeUnusedTcodeDetails(client, { runId, systemId, checkKey, tcodes }) {
  if (checkKey !== 'unusedTcodes') return;
  await replaceDetailRows(client, {
    table: 'unused_tcodes',
    columns: ['run_id', 'system_id', 'tcode', 'agr_name', 'status'],
    runId,
    systemId,
    rows: tcodes,
    toParams: (t, r, s) => [r, s, t.tcode, t.agrName, t.status],
  });
}

export async function writeUndeletedUserDetails(client, { runId, systemId, checkKey, users }) {
  if (checkKey !== 'undeletedUsers') return;
  await replaceDetailRows(client, {
    table: 'undeleted_users',
    columns: ['run_id', 'system_id', 'user_name', 'hr_status', 'status'],
    runId,
    systemId,
    rows: users,
    toParams: (u, r, s) => [r, s, u.userName, u.hrStatus, u.status],
  });
}

export async function writeRedundantRoleDetails(client, { runId, systemId, checkKey, roles }) {
  if (checkKey !== 'redundantRoles') return;
  await replaceDetailRows(client, {
    table: 'redundant_roles',
    columns: ['run_id', 'system_id', 'agr_name', 'parent_role', 'status'],
    runId,
    systemId,
    rows: roles,
    toParams: (r, runId, sysId) => [runId, sysId, r.agrName, r.parentRole, r.status],
  });
}

export async function writeEmptyShellDetails(client, { runId, systemId, checkKey, users }) {
  if (checkKey !== 'emptyShell') return;
  await replaceDetailRows(client, {
    table: 'empty_shell_users',
    columns: ['run_id', 'system_id', 'user_name', 'agr_name', 'user_valid', 'role_valid', 'status'],
    runId,
    systemId,
    rows: users,
    toParams: (u, r, s) => [r, s, u.userName, u.agrName, u.userValid, u.roleValid, u.status],
  });
}
