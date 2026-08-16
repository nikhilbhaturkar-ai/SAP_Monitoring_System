# SAP Monitoring System

Landscape health dashboard for the daily SAP Basis checklist, built as a
**Node.js + Express API over PostgreSQL** with a **React (Vite)** front end.
The source of truth is `ERP Monitoring Log.xlsx`, which is imported into Postgres
by an ETL script.

The visual design follows `SAP Monitoring Dashboard.dc.html` (the original
single-file prototype), and the dashboard structure follows the
`dashboard-designer` skill from <https://github.com/xcrrr/claude-skills>.

---

## Stack

| Layer    | Choice                                              |
|----------|-----------------------------------------------------|
| Database | PostgreSQL 16 (Docker, port **5433**)                |
| Backend  | Node.js + Express 4, `pg`, ES modules                |
| ETL      | `exceljs` → Postgres upsert                          |
| Collector| `node-cron` worker polling the SAP APIs every 15 min  |
| Frontend | React 18 + Vite 6, hand-built SVG charts (no chart lib) |

---

## Quick start

```bash
npm install          # installs both workspaces
npm run setup        # starts Postgres, applies schema+seed, imports the workbook
npm run dev          # API on :4000, dashboard on :5173
```

Open <http://localhost:5173>.

Individual steps, if you prefer:

```bash
npm run db:up        # docker compose up -d
npm run migrate      # schema.sql + seed.sql
npm run import       # parse the .xlsx into Postgres (idempotent)
npm run dev:server   # API only
npm run dev:client   # dashboard only
npm run db:reset     # drop the volume and start clean
```

Copy `.env.example` to `.env` to override the connection string, port, or the
workbook path. Defaults work out of the box with the bundled `docker-compose.yml`.

---

## Data model

Observations are stored **long-format** — one row per (run, system, check) — so a
new transaction code is a seed row, never a schema migration.

```
systems ────┐
            ├──< observations >──── monitoring_runs
checks  ────┘
```

| Table | Purpose |
|---|---|
| `systems` | The landscape: 3 SAP systems (MSP, MGP, SPA) + 3 URL endpoints |
| `checks` | The checklist: ST22, SM13, backups, DBA Cockpit volumes, … with each check's known-good phrase |
| `monitoring_runs` | One row per collection — midnight for Excel imports, the poll time for each 15-minute SAP cycle |
| `observations` | Raw cell text **plus** parsed `used_gb` / `total_gb` / `free_gb` and an `is_anomaly` flag |
| `daily_runs` | View: the newest **populated** run of each calendar day |
| `collector_runs` | Health log for the scheduled collector (status, counts, error text) |
| `observation_feed` | Flattened view joining all four |

Every dashboard query reads runs through `daily_runs`, never `monitoring_runs`
directly. The collector writes up to 96 runs a day; the view collapses each day
to its latest reading so the UI keeps its one-row-per-day shape while intraday
history accumulates underneath. The view skips runs with no observations, so a
cycle that collected nothing can never blank out that day.

Anomaly detection is a data rule, not code: a check is anomalous when its value
stops containing `checks.normal_text`. Retuning a threshold is an `UPDATE`.

### Volume parsing

The workbook records capacity in three inconsistent shapes; all three are parsed
at ingest so trend queries stay pure SQL:

| Cell text | used | total |
|---|---|---|
| `224.75 GB /2.91 TB` | 224.75 GB | 2979.84 GB |
| `Total: 107GB / Free: 43 GB` | 64 GB | 107 GB |
| `Total : 62 GB  / Free : 21 GB` | 41 GB | 62 GB |

---

## API

Base URL `http://localhost:4000/api`.

| Endpoint | Returns |
|---|---|
| `GET /health` | DB connectivity + latest run date |
| `GET /systems` | SAP systems and URL endpoints |
| `GET /checks` | The checklist definitions |
| `GET /runs?window=30` | Recent run dates |
| `GET /dashboard/:sid?window=20` | **The whole dashboard payload** — system card, alerts, endpoints, trends, landscape rollup |
| `GET /systems/:sid/history?window=60` | Per-run outcome rollup for the History Log tab |
| `GET /systems/:sid/trends/:checkKey?window=30` | Gap-filled series for one metric |
| `GET /endpoints?date=YYYY-MM-DD` | Endpoint availability on a date |
| `GET /collector/status?limit=20` | Recent SAP collector cycles and their outcome |

DBA Cockpit volumes aren't restated on every run, so `getVolumeSeries` gap-fills
them in SQL with the running-count / `first_value` window pattern; carried-forward
points are flagged so the chart tooltip can say so.

---

## Front end

`GET /dashboard/:sid` is the single call the page makes on load and on every
filter change, so every number on screen comes from one consistent snapshot.

Layout follows the F-pattern from the `dashboard-designer` skill: filters in one
row at the top, alerts and availability above the fold, then the system card,
then trends. Charts follow the `dataviz` skill:

- One categorical series colour (`#2a78d6` light / `#3987e5` dark) — validated
  against both surfaces with the skill's palette validator.
- Reserved status palette (good/warning/serious/critical), always rendered as
  **colour + glyph + text label**, never colour alone.
- 2px lines, ≥8px end markers with a 2px surface ring, hairline gridlines, one
  direct end label, crosshair + tooltip on hover and keyboard focus, and a
  "View data table" fallback on every chart.
- Light and dark themes, both stepped from the same ramps.

---

## Adding new monitoring data

Append rows to the workbook (or add a sheet) in the existing layout and re-run:

```bash
npm run import
```

Runs and observations upsert on their natural keys, so re-importing an unchanged
workbook is a no-op and re-importing a corrected one overwrites cleanly.

To monitor a new system or transaction code, add a row to `server/db/seed.sql`
and re-run `npm run migrate` — both files are written to be re-runnable.

---

## Scheduled SAP collector

A standalone worker polls the SAP APIs every 15 minutes and writes the readings
through the same ingest path as the Excel importer, so parsing and anomaly
detection are identical regardless of source.

```bash
npm run worker    # cron scheduler; collects once on boot, then every 15 min
npm run collect   # one-shot cycle, for testing endpoint configuration
```

`npm run dev` runs the worker alongside the API and the dashboard.

| File | Role |
|---|---|
| `server/src/worker.js` | `node-cron` scheduler (`SAP_COLLECT_CRON`, default `*/15 * * * *`) |
| `server/src/services/collector.js` | One cycle: poll → map → upsert, with an audit row |
| `server/src/sap/endpoints.js` | **Which** endpoint answers each check |
| `server/src/sap/client.js` | HTTP, auth, timeout, retry |
| `server/src/sap/mappers.js` | **How** each response becomes a stored value |
| `server/src/repositories/ingest.js` | Shared run/observation upserts |

### Not yet connected to SAP

The real SAP API contract is not known yet, so the HTTP layer ships as a
placeholder. Every `path` in `endpoints.js` is `null` and every mapper in
`mappers.js` returns `null`. The collector treats that as *skipped*, not as an
error: a cycle completes cleanly, writes **no** monitoring run, and records a
`skipped` row in `collector_runs`. The scheduler and database path are fully
wired and verifiable today.

To bring it online:

1. Fill in the `SAP_*` keys in `.env` (base URL per SID, auth mode, credentials)
   and set `SAP_ENABLED=true`.
2. Replace the `null` paths in `server/src/sap/endpoints.js`.
3. Implement the matching cases in `server/src/sap/mappers.js`, returning the
   free-text shapes documented in that file's header — the same shapes the
   workbook uses, so volume parsing and anomaly detection work unchanged.

Checks come online one at a time: any check still lacking a path or a mapper is
simply skipped while the configured ones are collected.

Check on it with `curl localhost:4000/api/collector/status`.
