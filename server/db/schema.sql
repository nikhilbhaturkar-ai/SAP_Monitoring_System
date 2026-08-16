-- SAP Monitoring System — PostgreSQL schema
-- Long-format observation store: one row per (run, system, check).

BEGIN;

CREATE TABLE IF NOT EXISTS systems (
  id          SERIAL PRIMARY KEY,
  sid         TEXT NOT NULL UNIQUE,          -- MSP / MGP / SPA / BIPROD / FIORI / WEBDISP
  name        TEXT NOT NULL,                 -- human label
  kind        TEXT NOT NULL CHECK (kind IN ('sap', 'url')),
  host        TEXT,                          -- host:port shown on URL tiles
  url         TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 100
);

-- The monitoring checklist. `normal_text` is the substring that marks a healthy
-- value; NULL + is_info means the value is informational and never an anomaly.
CREATE TABLE IF NOT EXISTS checks (
  key         TEXT PRIMARY KEY,              -- st22, backup, sm13, dataVol, ...
  label       TEXT NOT NULL,
  normal_text TEXT,
  is_info     BOOLEAN NOT NULL DEFAULT FALSE,
  is_volume   BOOLEAN NOT NULL DEFAULT FALSE, -- value parses into used/total GB
  sort_order  INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS monitoring_runs (
  id        SERIAL PRIMARY KEY,
  run_date  DATE NOT NULL UNIQUE,
  source    TEXT NOT NULL DEFAULT 'excel',
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS observations (
  id         BIGSERIAL PRIMARY KEY,
  run_id     INTEGER NOT NULL REFERENCES monitoring_runs(id) ON DELETE CASCADE,
  system_id  INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  check_key  TEXT NOT NULL REFERENCES checks(key) ON DELETE CASCADE,
  raw_value  TEXT,
  -- Parsed at ingest so trend queries stay pure SQL.
  used_gb    NUMERIC(12,2),
  total_gb   NUMERIC(12,2),
  free_gb    NUMERIC(12,2),
  is_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (run_id, system_id, check_key)
);

CREATE INDEX IF NOT EXISTS observations_system_check_idx
  ON observations (system_id, check_key);
CREATE INDEX IF NOT EXISTS observations_anomaly_idx
  ON observations (is_anomaly) WHERE is_anomaly;
CREATE INDEX IF NOT EXISTS monitoring_runs_date_idx
  ON monitoring_runs (run_date DESC);

-- Health log for the scheduled SAP collector. Kept separate from
-- monitoring_runs so a cycle that collected nothing is still auditable
-- without polluting the observation history.
CREATE TABLE IF NOT EXISTS collector_runs (
  id          BIGSERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL CHECK (status IN ('running','ok','skipped','partial','error')),
  attempted   INTEGER NOT NULL DEFAULT 0,   -- system × check pairs tried
  succeeded   INTEGER NOT NULL DEFAULT 0,   -- pairs that returned a usable value
  written     INTEGER NOT NULL DEFAULT 0,   -- observations upserted
  anomalies   INTEGER NOT NULL DEFAULT 0,
  error_text  TEXT
);
CREATE INDEX IF NOT EXISTS collector_runs_started_idx
  ON collector_runs (started_at DESC);

-- ---------------------------------------------------------------------------
-- Migration: one run per day → many runs per day.
--
-- The Excel importer wrote a single row per calendar day; the SAP collector
-- polls every 15 minutes. These statements are idempotent so `npm run migrate`
-- stays re-runnable against both fresh and existing databases.
-- ---------------------------------------------------------------------------
ALTER TABLE monitoring_runs ADD COLUMN IF NOT EXISTS run_at TIMESTAMPTZ;
-- Backfill legacy Excel rows to midnight so any same-day collector run sorts
-- after them and wins as the day's latest.
UPDATE monitoring_runs SET run_at = run_date::timestamptz WHERE run_at IS NULL;
ALTER TABLE monitoring_runs ALTER COLUMN run_at SET NOT NULL;
ALTER TABLE monitoring_runs ALTER COLUMN run_at SET DEFAULT now();
ALTER TABLE monitoring_runs DROP CONSTRAINT IF EXISTS monitoring_runs_run_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS monitoring_runs_at_source_idx
  ON monitoring_runs (run_at, source);
CREATE INDEX IF NOT EXISTS monitoring_runs_run_at_idx
  ON monitoring_runs (run_at DESC);

-- The newest populated run of each calendar day. Every dashboard query reads
-- runs through this view, so the UI keeps its one-row-per-day shape while the
-- 15-minute snapshots accumulate underneath.
--
-- The EXISTS filter matters: a collector cycle that wrote no observations (the
-- expected state until real SAP endpoints are configured) must never shadow
-- that day's populated run and blank the dashboard.
CREATE OR REPLACE VIEW daily_runs AS
SELECT DISTINCT ON (r.run_date)
       r.id, r.run_date, r.run_at, r.source, r.imported_at
  FROM monitoring_runs r
 WHERE EXISTS (SELECT 1 FROM observations o WHERE o.run_id = r.id)
 ORDER BY r.run_date, r.run_at DESC;

-- ---------------------------------------------------------------------------
-- ST22 dump detail: the individual runtime-error rows behind an st22
-- observation's count. Kept in its own table rather than jammed into
-- observations.raw_value (TEXT, one string) because it is a one-to-many
-- relationship — a single run can carry any number of dumps — and every other
-- reader of raw_value (History Log, alerts, trends) expects a plain display
-- string, not an encoded array.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS st22_dumps (
  id            BIGSERIAL PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES monitoring_runs(id) ON DELETE CASCADE,
  system_id     INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  dump_date     DATE,          -- SYDATE: when the runtime error occurred (not the poll time)
  dump_time     TEXT,          -- SYTIME, kept as SAP's HH:MM:SS text rather than parsed
  host          TEXT,          -- SYHOST
  sap_user      TEXT,          -- SYUSER ("user" avoided as a bare column name)
  dump_id       TEXT,          -- DUMPID, e.g. MESSAGE_TYPE_X
  program_name  TEXT,          -- PROGRAMNAME
  include_name  TEXT,          -- INCLUDENAME
  line_number   TEXT           -- LINENUMBER (SAP returns it as text)
);
CREATE INDEX IF NOT EXISTS st22_dumps_run_system_idx
  ON st22_dumps (run_id, system_id);

-- ---------------------------------------------------------------------------
-- Backup log detail: the individual backup runs (log + complete data backups)
-- behind a backup observation's overall status. Same reasoning as
-- st22_dumps — one-to-many, doesn't belong in raw_value. entry_start is the
-- natural sort key; a "complete data backup" and its paired "log backup" can
-- share the same clock minute, so time (not just date) matters for ordering.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_log (
  id            BIGSERIAL PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES monitoring_runs(id) ON DELETE CASCADE,
  system_id     INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  entry_type    TEXT,          -- ENTRY_TYPE, e.g. "log backup" / "complete data backup"
  entry_start   TIMESTAMP,     -- START_TIME, parsed (no timezone info in the source)
  entry_end     TIMESTAMP,     -- END_TIME
  entry_state   TEXT,          -- STATE, e.g. "successful" / "failed"
  entry_comment TEXT           -- COMMENT, often empty
);
CREATE INDEX IF NOT EXISTS backup_log_run_system_idx
  ON backup_log (run_id, system_id);

-- ---------------------------------------------------------------------------
-- SM12 lock detail: the individual lock entries behind an sm12 observation's
-- "locks held > 12h" count. Same reasoning as st22_dumps — one-to-many,
-- doesn't belong in raw_value.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sm12_locks (
  id            BIGSERIAL PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES monitoring_runs(id) ON DELETE CASCADE,
  system_id     INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  lock_user     TEXT,          -- GUNAME: who holds the lock
  table_name    TEXT,          -- GNAME: the locked object
  lock_mode     TEXT,          -- GMODE: E = exclusive, S = shared, etc.
  lock_time     TEXT,          -- GTDATE + GTTIME, when the lock was set
  duration_hrs  NUMERIC(10,2)  -- reserved: Z_SM12_LOCK_SRV doesn't return this per entry
);
CREATE INDEX IF NOT EXISTS sm12_locks_run_system_idx
  ON sm12_locks (run_id, system_id);

-- ---------------------------------------------------------------------------
-- SM51 application server detail: the server list behind an sm51
-- observation's overall STATE. Only the plain-text fields SAP's response
-- carries (NAME, HOST, HOSTNAMELONG, HOSTADDR_V4_STR) — the response also
-- includes several base64-encoded raw ABAP structure bytes (MSGTYPES,
-- HOSTADR, SERVNO, STATE, SYSSERVICEn) that duplicate the same information
-- in an internal binary form; those are not decoded or stored; see mappers.js.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sm51_servers (
  id            BIGSERIAL PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES monitoring_runs(id) ON DELETE CASCADE,
  system_id     INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  server_name   TEXT,          -- NAME
  host          TEXT,          -- HOST
  host_long     TEXT,          -- HOSTNAMELONG
  host_addr     TEXT           -- HOSTADDR_V4_STR
);
CREATE INDEX IF NOT EXISTS sm51_servers_run_system_idx
  ON sm51_servers (run_id, system_id);

-- ---------------------------------------------------------------------------
-- SM50 work process detail: the worker list behind an sm50 observation's
-- headline count. Z_SM50_WP_SRV: { WP_GT_THRESHOLD, WORKER_LIST_DISP: [...] }.
-- Only the fields useful for the click-through table are kept; the response
-- also carries several handle/session bookkeeping fields (LOGON_HDL,
-- SESSION_HDL, …) that aren't meaningful outside SAP's own UI.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sm50_workers (
  id            BIGSERIAL PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES monitoring_runs(id) ON DELETE CASCADE,
  system_id     INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  wp_index      INTEGER,       -- WP_INDEX
  wp_type       TEXT,          -- WP_TYPE_DISP: DIA, BTC, UPD, …
  wp_status     TEXT,          -- STATE_DISP: Waiting, Running, On Hold, …
  wp_info       TEXT,          -- STATE_INFO_DISP: e.g. "Debugging"
  server_name   TEXT,          -- SERVER_NAME
  wp_user       TEXT,          -- USER_NAME
  wp_program    TEXT,          -- WP_PROGRAM (falls back to MAIN_PROGRAM if blank)
  wp_cpu        TEXT           -- CPU (already formatted HH:MM:SS)
);
CREATE INDEX IF NOT EXISTS sm50_workers_run_system_idx
  ON sm50_workers (run_id, system_id);

-- Flattened view: every observation with its date and system, ready for the API.
CREATE OR REPLACE VIEW observation_feed AS
SELECT r.run_date,
       s.sid,
       s.name       AS system_name,
       s.kind       AS system_kind,
       c.key        AS check_key,
       c.label      AS check_label,
       c.is_info,
       c.is_volume,
       c.sort_order AS check_order,
       o.raw_value,
       o.used_gb,
       o.total_gb,
       o.free_gb,
       o.is_anomaly
FROM observations o
JOIN monitoring_runs r ON r.id = o.run_id
JOIN systems s        ON s.id = o.system_id
JOIN checks c         ON c.key = o.check_key;

COMMIT;
