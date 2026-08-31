// Every query here reads runs through the `daily_runs` view rather than
// `monitoring_runs` directly. The SAP collector writes up to 96 runs a day, so
// querying the base table would shrink the "last N runs" windows to a few
// hours, duplicate run dates, and multiply the History Log anomaly counts.
// `daily_runs` collapses each day to its newest populated run.
import { query } from '../db.js';

export async function listSystems() {
  const { rows } = await query(
    `SELECT sid, name, kind, host, url
       FROM systems
      ORDER BY sort_order, sid`
  );
  return rows;
}

export async function listChecks() {
  const { rows } = await query(
    `SELECT key, label, normal_text, is_info, is_volume, sort_order
       FROM checks
      ORDER BY sort_order`
  );
  return rows;
}

export async function getLatestRunDate() {
  const { rows } = await query('SELECT max(run_date) AS run_date FROM daily_runs');
  return rows[0]?.run_date ?? null;
}

/**
 * Latest run date that actually holds data for one system.
 *
 * Landscape-wide `getLatestRunDate()` is wrong for a per-system dashboard: now
 * that some systems poll a live API on today's date while others still sit on
 * a months-old Excel import, the global max would point a stale system's
 * dashboard at a date it has no observations for at all, silently emptying
 * every tile. Each system must anchor to its own newest run.
 */
export async function getLatestRunDateForSystem(sid) {
  const { rows } = await query(
    `SELECT max(r.run_date) AS run_date
       FROM daily_runs r
       JOIN observations o ON o.run_id = r.id
       JOIN systems s      ON s.id = o.system_id
      WHERE s.sid = $1`,
    [sid]
  );
  return rows[0]?.run_date ?? null;
}

/**
 * Each check's most recent successful reading for one system, one row per
 * `check_key` — the checks grid's "what's true right now" snapshot.
 *
 * Deliberately reads `monitoring_runs` directly rather than through
 * `daily_runs`, unlike every other query in this file. `daily_runs` collapses
 * a day to its single newest *populated* run, which is right for trends and
 * the History Log (one row per day) but wrong here: the SAP collector writes
 * a run every 15 minutes, and a given check can fail one cycle (host
 * timeout) after succeeding on an earlier cycle the same day. Collapsing to
 * only the day's last run would then drop that check from the grid entirely,
 * even though it reported cleanly minutes before. Taking each check's own
 * latest row across all of that system's runs — not the whole grid's latest
 * run — fixes that without touching the daily-run invariant anywhere else.
 */
export async function getLatestChecksSnapshot(sid, windowDays = 20) {
  const { rows } = await query(
    `SELECT DISTINCT ON (o.check_key)
            o.check_key,
            c.label      AS check_label,
            c.normal_text,
            c.is_info,
            c.is_volume,
            c.sort_order AS check_order,
            o.raw_value,
            o.used_gb,
            o.total_gb,
            o.free_gb,
            o.is_anomaly,
            mr.run_date,
            mr.source
       FROM observations o
       JOIN monitoring_runs mr ON mr.id = o.run_id
       JOIN systems s          ON s.id = o.system_id
       JOIN checks c           ON c.key = o.check_key
      WHERE s.sid = $1
        AND mr.run_date >= (CURRENT_DATE - $2::int)
      ORDER BY o.check_key, mr.run_at DESC`,
    [sid, windowDays]
  );
  return rows;
}

/** Distinct run dates, newest first, capped at `limit`. */
export async function listRunDates(limit = 20) {
  const { rows } = await query(
    `SELECT run_date FROM daily_runs ORDER BY run_date DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.run_date);
}

/**
 * Every observation for one system across the last `windowDays` runs.
 *
 * Carries `source` ('excel' | 'sap-api') through from daily_runs so callers
 * can tell a workbook-imported reading from a live-polled one — the two look
 * identical otherwise, and a stale Excel row must never be presented as a
 * current live reading.
 */
export async function getSystemObservations(sid, windowDays = 20) {
  const { rows } = await query(
    `WITH window_runs AS (
       SELECT id, run_date, source
         FROM daily_runs
        ORDER BY run_date DESC
        LIMIT $2
     )
     SELECT wr.run_date,
            wr.source,
            o.check_key,
            c.label      AS check_label,
            c.normal_text,
            c.is_info,
            c.is_volume,
            c.sort_order AS check_order,
            o.raw_value,
            o.used_gb,
            o.total_gb,
            o.free_gb,
            o.is_anomaly
       FROM window_runs wr
       JOIN observations o ON o.run_id = wr.id
       JOIN systems s      ON s.id = o.system_id
       JOIN checks c       ON c.key = o.check_key
      WHERE s.sid = $1
      ORDER BY wr.run_date DESC, c.sort_order`,
    [sid, windowDays]
  );
  return rows;
}

/**
 * Volume series for a system, gap-filled forward.
 *
 * DBA Cockpit volumes are not always re-stated on every run. The running
 * count of non-null readings forms a group id; within a group the first value
 * is the most recent real measurement, so `first_value` carries it forward.
 *
 * `source` rides along the same carry-forward as raw_value/used_gb: a
 * gap-filled point reports the source of the run its value actually came
 * from, not the run it's displayed on.
 */
export async function getVolumeSeries(sid, checkKeys, windowDays = 20) {
  const { rows } = await query(
    `WITH window_runs AS (
       SELECT id, run_date, source
         FROM daily_runs
        ORDER BY run_date DESC
        LIMIT $3
     ),
     ordered AS (
       SELECT wr.run_date,
              wr.source,
              o.check_key,
              o.raw_value,
              o.used_gb,
              o.total_gb,
              o.free_gb,
              count(o.used_gb) OVER (
                PARTITION BY o.check_key ORDER BY wr.run_date
              ) AS fill_group
         FROM window_runs wr
         JOIN observations o ON o.run_id = wr.id
         JOIN systems s      ON s.id = o.system_id
        WHERE s.sid = $1
          AND o.check_key = ANY($2::text[])
     )
     SELECT run_date,
            check_key,
            first_value(source)    OVER w AS source,
            first_value(raw_value) OVER w AS raw_value,
            first_value(used_gb)   OVER w AS used_gb,
            first_value(total_gb)  OVER w AS total_gb,
            first_value(free_gb)   OVER w AS free_gb,
            used_gb IS NULL        AS carried_forward
       FROM ordered
     WINDOW w AS (PARTITION BY check_key, fill_group ORDER BY run_date)
      ORDER BY run_date`,
    [sid, checkKeys, windowDays]
  );
  return rows;
}

/** Anomalies for one system inside the window, newest first. */
export async function getAnomalies(sid, windowDays = 20) {
  const { rows } = await query(
    `WITH window_runs AS (
       SELECT id, run_date
         FROM daily_runs
        ORDER BY run_date DESC
        LIMIT $2
     )
     SELECT wr.run_date,
            o.check_key,
            c.label AS check_label,
            o.raw_value
       FROM window_runs wr
       JOIN observations o ON o.run_id = wr.id
       JOIN systems s      ON s.id = o.system_id
       JOIN checks c       ON c.key = o.check_key
      WHERE s.sid = $1
        AND o.is_anomaly
      ORDER BY wr.run_date DESC, c.sort_order`,
    [sid, windowDays]
  );
  return rows;
}

/**
 * ST22 dump rows for one system on its latest run. Scoped to the latest run
 * only (not the windowDays trail getSystemObservations covers) because a dump
 * list is "what's wrong right now" detail, the same scope the DBA Cockpit
 * volume tiles already use — older runs' dumps stay in the table for later,
 * but nothing today reads them.
 */
export async function getLatestSt22Dumps(sid) {
  const { rows } = await query(
    `SELECT d.dump_date, d.dump_time, d.host, d.sap_user, d.dump_id,
            d.program_name, d.include_name, d.line_number
       FROM st22_dumps d
       JOIN systems s    ON s.id = d.system_id
       JOIN daily_runs r ON r.id = d.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY d.dump_date DESC NULLS LAST, d.dump_time DESC NULLS LAST, d.id`,
    [sid]
  );
  return rows;
}

/**
 * Backup log entries for one system's latest run. Same latest-run-only scope
 * as getLatestSt22Dumps, and the same reasoning: this is evidence for whatever
 * the backup tile currently shows, not a general-purpose history browser.
 */
export async function getLatestBackupLog(sid) {
  const { rows } = await query(
    `SELECT b.entry_type, b.entry_start, b.entry_end, b.entry_state, b.entry_comment
       FROM backup_log b
       JOIN systems s    ON s.id = b.system_id
       JOIN daily_runs r ON r.id = b.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY b.entry_start DESC NULLS LAST, b.id`,
    [sid]
  );
  return rows;
}

/** SM12 lock entries for one system's latest run. */
export async function getLatestLocks(sid) {
  const { rows } = await query(
    `SELECT l.lock_user, l.table_name, l.lock_mode, l.lock_time, l.duration_hrs
       FROM sm12_locks l
       JOIN systems s    ON s.id = l.system_id
       JOIN daily_runs r ON r.id = l.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY l.duration_hrs DESC NULLS LAST, l.id`,
    [sid]
  );
  return rows;
}

/** SM51 application server list for one system's latest run. */
export async function getLatestServers(sid) {
  const { rows } = await query(
    `SELECT sv.server_name, sv.host, sv.host_long, sv.host_addr
       FROM sm51_servers sv
       JOIN systems s    ON s.id = sv.system_id
       JOIN daily_runs r ON r.id = sv.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY sv.id`,
    [sid]
  );
  return rows;
}

/** SM50 work process list for one system's latest run. */
export async function getLatestWorkers(sid) {
  const { rows } = await query(
    `SELECT w.wp_index, w.wp_type, w.wp_status, w.wp_info, w.server_name,
            w.wp_user, w.wp_program, w.wp_cpu, w.wp_pid, w.wait_priority
       FROM sm50_workers w
       JOIN systems s    ON s.id = w.system_id
       JOIN daily_runs r ON r.id = w.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY w.wp_index`,
    [sid]
  );
  return rows;
}

/** Endpoint availability on a given run date (defaults to the latest run). */
/** SM37 long-running job list for one system's latest run. */
export async function getLatestJobs(sid) {
  const { rows } = await query(
    `SELECT j.job_name, j.sched_date, j.sched_time
       FROM sm37_jobs j
       JOIN systems s    ON s.id = j.system_id
       JOIN daily_runs r ON r.id = j.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY j.sched_date DESC NULLS LAST, j.sched_time DESC NULLS LAST, j.id`,
    [sid]
  );
  return rows;
}

/** Cancelled job list for one system's latest run. */
export async function getLatestCancelJobs(sid) {
  const { rows } = await query(
    `SELECT c.job_name, c.sched_date, c.sched_time, c.user_name, c.status,
            c.job_log, c.wp_process, c.btcsysreax, c.reaxserver
       FROM cancel_jobs c
       JOIN systems s    ON s.id = c.system_id
       JOIN daily_runs r ON r.id = c.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY c.sched_date DESC NULLS LAST, c.sched_time DESC NULLS LAST, c.id`,
    [sid]
  );
  return rows;
}

/** Expired-certificate list for one system's latest run. */
export async function getLatestCerts(sid) {
  const { rows } = await query(
    `SELECT c.cert_result, c.certificate, c.valid_from, c.valid_to
       FROM strust_certs c
       JOIN systems s    ON s.id = c.system_id
       JOIN daily_runs r ON r.id = c.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY c.valid_to ASC NULLS LAST, c.id`,
    [sid]
  );
  return rows;
}

/** SMQ1/SMQ2 error-queue rows for one system's latest run, filtered by check_key. */
export async function getLatestQueueErrors(sid, checkKey) {
  const { rows } = await query(
    `SELECT q.arfcipid, q.arfcpid, q.queue_name, q.destination, q.queue_state, q.rfc_user,
            q.rfc_function, q.rfc_date, q.rfc_time, q.error_message
       FROM queue_errors q
       JOIN systems s    ON s.id = q.system_id
       JOIN daily_runs r ON r.id = q.run_id
      WHERE s.sid = $1
        AND q.check_key = $2
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY q.rfc_date DESC NULLS LAST, q.rfc_time DESC NULLS LAST, q.id`,
    [sid, checkKey]
  );
  return rows;
}

/** SM20 audit file rows for one system's latest run. */
export async function getLatestAuditFiles(sid) {
  const { rows } = await query(
    `SELECT a.instance_name, a.file_name, a.record_count, a.record_good, a.max_size,
            a.end_reason, a.output_text
       FROM audit_files a
       JOIN systems s    ON s.id = a.system_id
       JOIN daily_runs r ON r.id = a.run_id
      WHERE s.sid = $1
        AND r.run_date = (SELECT max(run_date) FROM daily_runs)
      ORDER BY a.id`,
    [sid]
  );
  return rows;
}

export async function getUrlStatuses(runDate = null) {
  const { rows } = await query(
    `SELECT s.sid, s.name, s.host, s.url, o.raw_value
       FROM observations o
       JOIN systems s          ON s.id = o.system_id
       JOIN daily_runs r       ON r.id = o.run_id
      WHERE s.kind = 'url'
        AND o.check_key = 'urlStatus'
        AND r.run_date = COALESCE($1::date, (SELECT max(run_date) FROM daily_runs))
      ORDER BY s.sort_order`,
    [runDate]
  );
  return rows;
}

/** Per-run anomaly rollup used by the History Log tab. */
export async function getSystemHistory(sid, limit = 60) {
  const { rows } = await query(
    `SELECT r.run_date,
            count(*) FILTER (WHERE o.is_anomaly) AS anomaly_count,
            coalesce(
              array_agg(o.raw_value ORDER BY c.sort_order)
                FILTER (WHERE o.is_anomaly),
              '{}'
            ) AS anomaly_values,
            coalesce(
              array_agg(c.label ORDER BY c.sort_order)
                FILTER (WHERE o.is_anomaly),
              '{}'
            ) AS anomaly_labels
       FROM daily_runs r
       JOIN observations o ON o.run_id = r.id
       JOIN systems s      ON s.id = o.system_id
       JOIN checks c       ON c.key = o.check_key
      WHERE s.sid = $1
      GROUP BY r.run_date
      ORDER BY r.run_date DESC
      LIMIT $2`,
    [sid, limit]
  );
  return rows;
}

/** Landscape-wide counts for the overview strip. */
export async function getLandscapeSummary(windowDays = 20) {
  const { rows } = await query(
    `WITH window_runs AS (
       SELECT id, run_date
         FROM daily_runs
        ORDER BY run_date DESC
        LIMIT $1
     ),
     latest AS (SELECT max(run_date) AS run_date FROM window_runs)
     SELECT s.sid,
            s.name,
            count(*) FILTER (
              WHERE o.is_anomaly AND wr.run_date = (SELECT run_date FROM latest)
            ) AS open_alerts,
            count(*) FILTER (WHERE o.is_anomaly) AS window_alerts
       FROM window_runs wr
       JOIN observations o ON o.run_id = wr.id
       JOIN systems s      ON s.id = o.system_id
      WHERE s.kind = 'sap'
      GROUP BY s.sid, s.name, s.sort_order
      ORDER BY s.sort_order`,
    [windowDays]
  );
  return rows;
}
