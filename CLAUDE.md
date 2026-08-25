# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # single root install — one Next.js app, no workspaces
npm run setup        # db:up + migrate + import — full cold start
npm run dev          # concurrently: Next.js dev server :3000, collector worker, batch backend :8000

npm run db:up        # docker compose up -d   (Postgres 16 on host port 5433)
npm run db:reset     # drop the volume and start clean
npm run migrate      # re-applies db/schema.sql then db/seed.sql (idempotent)
npm run import       # ETL the .xlsx into Postgres (idempotent)
npm run collect      # one-shot SAP collection cycle
npm run worker       # cron scheduler: collect on boot, then every 15 min
npm run build        # next build — production build of the whole app
npm run start        # next start — serve the production build
```

**There is no test runner, linter, or CI in this repo** — no test script, no test files, no ESLint config. Verification is manual: `curl localhost:3000/api/health`, the other API endpoints, and `docker exec sap_monitoring_db psql -U sapmon -d sap_monitoring -c "…"`. When changing query or ingest behaviour, capture the affected endpoint's response before and after and diff them.

## Architecture

A single Next.js (App Router) application at the repo root — Node.js ESM throughout (`"type": "module"`), no ORM, raw SQL through the `pg` pool. Two other processes still run alongside it and share the same database / API surface:

```
ERP Monitoring Log.xlsx ──> scripts/import-excel.js ─┐
                                                     ├─> lib/server/repositories/ingest.js ──> Postgres
SAP APIs (placeholder) ──> lib/server/services/collector.js ─┘                                    │
                              ▲ scripts/worker.js (node-cron, */15)                                │
                                                                                                    ▼
        app/ (React, App Router) <── app/api/**/route.js <── lib/server/services/ <── lib/server/repositories/monitoring.js

batch-monitor-backend/ (Python/FastAPI, separate process, port 8000)
        ▲
        └── reverse-proxied by app/api/batch/[...path]/route.js (SSE-safe passthrough)
```

Route Handlers (`app/api/**/route.js`) replace the old Express routes one-for-one; `lib/server/{config.js,db.js,repositories,services,lib,sap}` is a near-verbatim port of the former `server/src/**` — same SQL, same business logic, just re-homed so both the Next.js request path and the standalone `scripts/*.js` (migrate/import/collect/worker) can import it directly.

### The `daily_runs` invariant

`monitoring_runs` holds **one row per collection**, not per day: the Excel importer writes midnight of the run date, the collector writes the actual poll time (up to 96 rows/day). Every read path must go through the `daily_runs` view, which returns the newest *populated* run of each calendar day.

Querying `monitoring_runs` directly from a dashboard query is a bug. It breaks in four separate ways: `LIMIT n` windows collapse from n days to a few hours, `GROUP BY run_date` multiplies anomaly counts by the number of daily cycles, `run_date = max(run_date)` fans endpoint tiles out into duplicates, and run-date lists repeat.

The view's `WHERE EXISTS (… observations …)` filter is load-bearing — it stops a collection cycle that gathered nothing from becoming the day's "latest" and blanking the dashboard.

### Data model: long format, data-driven rules

One row per `(run, system, check)`. Adding a transaction code or a system is a **seed row in `db/seed.sql`**, never a schema migration.

Anomaly detection is likewise data, not code: `isAnomaly()` (`lib/server/lib/metrics.js`) flags a check when its value stops containing that check's `checks.normal_text`. Retuning is an `UPDATE`, so resist adding per-check branching in JS.

`db/schema.sql` is re-applied wholesale by `scripts/migrate.js` on every run, so everything in it must stay idempotent — `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, unique *indexes* rather than unnamed constraints.

### Ingest

`lib/server/repositories/ingest.js` is the single write path shared by both sources — `loadReferenceData`, `openRun`, `writeObservation`. New data sources belong here rather than writing their own SQL, so volume parsing and anomaly flagging stay identical everywhere.

Both `monitoring_runs` and `observations` upsert on natural keys (`(run_at, source)` and `(run_id, system_id, check_key)`), so re-running any importer is safe.

### Volumes: parsed at ingest, gap-filled in SQL

Readings arrive as free text in inconsistent shapes; `parseVolume()` handles all of them and stores `used_gb` / `total_gb` / `free_gb` so trend queries stay pure SQL:

| Text | used | total |
|---|---|---|
| `224.75 GB /2.91 TB` | 224.75 | 2979.84 |
| `Total: 107GB / Free: 43 GB` | 64 | 107 |

DBA Cockpit volumes aren't restated on every run, so `getVolumeSeries` gap-fills forward using a running-count group id plus `first_value` windows, and flags carried-forward points for the tooltip.

### SAP collector — placeholder state

The collector is fully wired but **not yet connected to SAP**: every `path` in `lib/server/sap/endpoints.js` is `null` and every case in `lib/server/sap/mappers.js` returns `null`. That is treated as *skipped*, never an error — a cycle completes cleanly, writes no `monitoring_runs` row, and records a `skipped` row in `collector_runs`.

`fetchCheck()` must never throw; it returns `{status: 'skipped'|'ok'|'error'}` so one dead host cannot abort a cycle. Checks come online individually as paths and mappers are filled in.

Mappers must return the **same free-text shapes the workbook uses** (containing the check's `normal_text` when healthy; `"accessable"` for `urlStatus`) so nothing downstream needs to change.

`collectOnce()` guards against overlap with a module-level `isRunning` flag, since a SAP outage can make a cycle outlast its 15-minute slot. `scripts/worker.js` (started by `npm run worker`, or `npm run dev`) is still a standalone process, deliberately separate from the Next.js request path — a slow SAP host must never touch web request handling, and restarting the dev/prod server doesn't reset the schedule.

### API and front end

`GET /api/dashboard/:sid` (`app/api/dashboard/[sid]/route.js`) returns the **entire** page payload — system card, alerts, endpoints, trends, landscape rollup — so every number on screen comes from one consistent snapshot. `lib/server/services/dashboard.js` does all shaping; components stay presentational. Extend that payload rather than adding chatty endpoints.

`GET /api/collector/status` exposes recent `collector_runs` for job health.

Charts are hand-built SVG — there is no chart library, deliberately. Status is always rendered as **colour + glyph + text** (`lib/status.js`), never colour alone, and every chart carries a "View data table" fallback.

The dashboard (`components/MonitoringDashboard.jsx` and `components/*`) and the Batch Job Monitor (`components/batch/*`, ported from the former `client/src/batch-job-monitor/**`, still TypeScript) are both mounted client-side from `app/AppSwitcher.jsx` — a `"use client"` tab switcher rendered by the server component `app/page.jsx`. Only components that actually use hooks/browser APIs carry their own `"use client"` directive; purely presentational pieces stay plain and are still fine to import from a client tree.

### Batch Job Monitor proxy

`app/api/batch/[...path]/route.js` reverse-proxies `/api/batch/**` to the separate Python/FastAPI process in `batch-monitor-backend/` (`config.batchMonitorUrl`, default `http://127.0.0.1:8000`), the same way the old Express server's `http-proxy-middleware` mount did. It forwards the request body/headers (stripping hop-by-hop headers) and returns `upstream.body` directly as the `Response` body — critical for `GET /investigations/:id/stream`, which is Server-Sent Events and must never be buffered. The route is forced dynamic (`export const dynamic = 'force-dynamic'`) so Next never tries to statically evaluate or cache it.

`batch-monitor-backend/` itself is untouched — still started separately via `npm run dev:batch-backend` (`uvicorn app.main:app --reload --port 8000`), still its own venv, still out of scope for anything under `app/` or `lib/`.

## Gotchas

- Postgres is on **5433**, not 5432 (`docker-compose.yml`), container `sap_monitoring_db`.
- `.env` is read from the **repo root** (`lib/server/config.js`, resolved relative to that file up to the repo root). Every key has an inline default, so the app starts without it.
- `lib/server/db.js` overrides two `pg` type parsers: `NUMERIC` → JS number, `DATE` → plain ISO string (avoids timezone drift). Date values from queries are strings, not `Date`s. The pool is cached on `globalThis` so Next's dev-mode module hot-reloading doesn't leak a fresh `pg.Pool` per reload.
- Logging is `console` only; there is no logger library. Scripts prefix progress with `> ` and mask credentials via `.replace(/:[^:@/]+@/, ':***@')`.
- `next dev` has a built-in "agent rules" feature that appends a block to this very file on every run — it is disabled via `agentRules: false` in `next.config.mjs` specifically so it doesn't fight with this hand-maintained doc.
- `support.js` and `SAP Monitoring Dashboard.dc.html` at the root are the generated prototype kept as a design reference — not part of the app.
- `run.bat` / `run.ps1` and `README.md` at the root predate this Next.js migration and still describe the old `client/`+`server/` layout; they have not been updated as part of this change.
