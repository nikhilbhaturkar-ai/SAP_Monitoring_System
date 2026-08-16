# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # installs both workspaces (server, client)
npm run setup        # db:up + migrate + import — full cold start
npm run dev          # concurrently: API :4000, Vite :5173, collector worker

npm run db:up        # docker compose up -d   (Postgres 16 on host port 5433)
npm run db:reset     # drop the volume and start clean
npm run migrate      # re-applies schema.sql then seed.sql (idempotent)
npm run import       # ETL the .xlsx into Postgres (idempotent)
npm run collect      # one-shot SAP collection cycle
npm run worker       # cron scheduler: collect on boot, then every 15 min
npm run build        # Vite production build of the client
```

**There is no test runner, linter, or CI in this repo** — no test script, no test files, no ESLint config. Verification is manual: `curl localhost:4000/api/health`, the other API endpoints, and `docker exec sap_monitoring_db psql -U sapmon -d sap_monitoring -c "…"`. When changing query or ingest behaviour, capture the affected endpoint's response before and after and diff them.

This directory is **not a git repository**.

## Architecture

Node.js ESM throughout (`"type": "module"`), no TypeScript, no ORM — raw SQL through the `pg` pool. Three processes share one database:

```
ERP Monitoring Log.xlsx ──> scripts/import-excel.js ─┐
                                                     ├─> repositories/ingest.js ──> Postgres
SAP APIs (placeholder) ──> services/collector.js ────┘                                 │
                              ▲ src/worker.js (node-cron, */15)                        │
                                                                                       ▼
                     client/ (React) <── routes/api.js <── services/ <── repositories/monitoring.js
```

### The `daily_runs` invariant

`monitoring_runs` holds **one row per collection**, not per day: the Excel importer writes midnight of the run date, the collector writes the actual poll time (up to 96 rows/day). Every read path must go through the `daily_runs` view, which returns the newest *populated* run of each calendar day.

Querying `monitoring_runs` directly from a dashboard query is a bug. It breaks in four separate ways: `LIMIT n` windows collapse from n days to a few hours, `GROUP BY run_date` multiplies anomaly counts by the number of daily cycles, `run_date = max(run_date)` fans endpoint tiles out into duplicates, and run-date lists repeat.

The view's `WHERE EXISTS (… observations …)` filter is load-bearing — it stops a collection cycle that gathered nothing from becoming the day's "latest" and blanking the dashboard.

### Data model: long format, data-driven rules

One row per `(run, system, check)`. Adding a transaction code or a system is a **seed row in `server/db/seed.sql`**, never a schema migration.

Anomaly detection is likewise data, not code: `isAnomaly()` (`server/src/lib/metrics.js`) flags a check when its value stops containing that check's `checks.normal_text`. Retuning is an `UPDATE`, so resist adding per-check branching in JS.

`server/db/schema.sql` is re-applied wholesale by `migrate.js` on every run, so everything in it must stay idempotent — `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, unique *indexes* rather than unnamed constraints.

### Ingest

`server/src/repositories/ingest.js` is the single write path shared by both sources — `loadReferenceData`, `openRun`, `writeObservation`. New data sources belong here rather than writing their own SQL, so volume parsing and anomaly flagging stay identical everywhere.

Both `monitoring_runs` and `observations` upsert on natural keys (`(run_at, source)` and `(run_id, system_id, check_key)`), so re-running any importer is safe.

### Volumes: parsed at ingest, gap-filled in SQL

Readings arrive as free text in inconsistent shapes; `parseVolume()` handles all of them and stores `used_gb` / `total_gb` / `free_gb` so trend queries stay pure SQL:

| Text | used | total |
|---|---|---|
| `224.75 GB /2.91 TB` | 224.75 | 2979.84 |
| `Total: 107GB / Free: 43 GB` | 64 | 107 |

DBA Cockpit volumes aren't restated on every run, so `getVolumeSeries` gap-fills forward using a running-count group id plus `first_value` windows, and flags carried-forward points for the tooltip.

### SAP collector — placeholder state

The collector is fully wired but **not yet connected to SAP**: every `path` in `server/src/sap/endpoints.js` is `null` and every case in `server/src/sap/mappers.js` returns `null`. That is treated as *skipped*, never an error — a cycle completes cleanly, writes no `monitoring_runs` row, and records a `skipped` row in `collector_runs`.

`fetchCheck()` must never throw; it returns `{status: 'skipped'|'ok'|'error'}` so one dead host cannot abort a cycle. Checks come online individually as paths and mappers are filled in.

Mappers must return the **same free-text shapes the workbook uses** (containing the check's `normal_text` when healthy; `"accessable"` for `urlStatus`) so nothing downstream needs to change.

`collectOnce()` guards against overlap with a module-level `isRunning` flag, since a SAP outage can make a cycle outlast its 15-minute slot.

### API and front end

`GET /api/dashboard/:sid` returns the **entire** page payload — system card, alerts, endpoints, trends, landscape rollup — so every number on screen comes from one consistent snapshot. `services/dashboard.js` does all shaping; components stay presentational. Extend that payload rather than adding chatty endpoints.

`GET /api/collector/status` exposes recent `collector_runs` for job health.

Charts are hand-built SVG — there is no chart library, deliberately. Status is always rendered as **colour + glyph + text** (`client/src/lib/status.js`), never colour alone, and every chart carries a "View data table" fallback.

## Gotchas

- Postgres is on **5433**, not 5432 (`docker-compose.yml`), container `sap_monitoring_db`.
- `.env` is read from the **repo root**, not `server/` (`server/src/config.js`). Every key has an inline default, so the app starts without it.
- `server/src/db.js` overrides two `pg` type parsers: `NUMERIC` → JS number, `DATE` → plain ISO string (avoids timezone drift). Date values from queries are strings, not `Date`s.
- Logging is `console` only (`morgan` for HTTP); there is no logger library. Scripts prefix progress with `> ` and mask credentials via `.replace(/:[^:@/]+@/, ':***@')`.
- `support.js` and `SAP Monitoring Dashboard.dc.html` at the root are the generated prototype kept as a design reference — not part of the app.
