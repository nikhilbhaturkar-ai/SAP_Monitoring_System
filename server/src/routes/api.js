import { Router } from 'express';
import * as repo from '../repositories/monitoring.js';
import { buildDashboard, buildHistory, buildTrend } from '../services/dashboard.js';
import { listCollectorRuns } from '../services/collector.js';
import { query } from '../db.js';

export const api = Router();

/** Wrap an async handler so rejections reach the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function windowDaysFrom(req, fallback = 20) {
  const raw = Number(req.query.window);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 1), 365);
}

api.get(
  '/health',
  wrap(async (_req, res) => {
    const { rows } = await query('SELECT now() AS db_time');
    const latest = await repo.getLatestRunDate();
    res.json({ status: 'ok', dbTime: rows[0].db_time, latestRun: latest });
  })
);

api.get(
  '/systems',
  wrap(async (_req, res) => {
    const systems = await repo.listSystems();
    res.json({
      sap: systems.filter((s) => s.kind === 'sap'),
      endpoints: systems.filter((s) => s.kind === 'url'),
    });
  })
);

api.get(
  '/checks',
  wrap(async (_req, res) => {
    res.json(await repo.listChecks());
  })
);

api.get(
  '/runs',
  wrap(async (req, res) => {
    res.json(await repo.listRunDates(windowDaysFrom(req, 30)));
  })
);

/** Health of the scheduled SAP collector, newest cycle first. */
api.get(
  '/collector/status',
  wrap(async (req, res) => {
    const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit) || 20), 1), 200);
    res.json(await listCollectorRuns(limit));
  })
);

/** The single call the dashboard makes on load and on system switch. */
api.get(
  '/dashboard/:sid',
  wrap(async (req, res) => {
    const sid = req.params.sid.toUpperCase();
    res.json(await buildDashboard(sid, windowDaysFrom(req)));
  })
);

api.get(
  '/systems/:sid/history',
  wrap(async (req, res) => {
    const sid = req.params.sid.toUpperCase();
    res.json(await buildHistory(sid, windowDaysFrom(req, 60)));
  })
);

api.get(
  '/systems/:sid/trends/:checkKey',
  wrap(async (req, res) => {
    const sid = req.params.sid.toUpperCase();
    res.json(await buildTrend(sid, req.params.checkKey, windowDaysFrom(req, 30)));
  })
);

api.get(
  '/endpoints',
  wrap(async (req, res) => {
    const rows = await repo.getUrlStatuses(req.query.date || null);
    res.json(
      rows.map((row) => ({
        sid: row.sid,
        name: row.name,
        host: row.host,
        url: row.url,
        reachable: /accessable|accessible/i.test(row.raw_value || ''),
        raw: row.raw_value,
      }))
    );
  })
);
