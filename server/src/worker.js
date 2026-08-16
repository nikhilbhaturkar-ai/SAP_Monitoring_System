/**
 * Scheduled SAP collector — a standalone process, deliberately separate from
 * the API so a slow SAP host or a crashed cycle never touches the dashboard's
 * event loop, and an API restart does not reset the schedule.
 *
 * Start with `npm run worker` (or `npm run dev`, which runs it alongside the
 * API and the Vite dev server).
 */
import cron from 'node-cron';
import { config } from './config.js';
import { pool } from './db.js';
import { collectOnce } from './services/collector.js';

if (!cron.validate(config.sap.cron)) {
  console.error(`invalid SAP_COLLECT_CRON expression: "${config.sap.cron}"`);
  process.exit(1);
}

/** Run a cycle, logging failures rather than killing the worker. */
async function tick(trigger) {
  console.log(`> [${new Date().toISOString()}] collection tick (${trigger})`);
  try {
    await collectOnce();
  } catch (err) {
    console.error('collection failed:', err.message);
  }
}

const task = cron.schedule(config.sap.cron, () => tick('scheduled'), { scheduled: false });

console.log(`SAP collector worker started — schedule "${config.sap.cron}"`);
if (!config.sap.enabled) {
  console.warn(
    '> SAP_ENABLED is not "true": endpoints are unconfigured, so cycles will ' +
      'record a skipped run and write no observations.'
  );
}

task.start();
// Collect once on boot so a misconfiguration surfaces immediately instead of
// after a silent 15-minute wait.
tick('startup');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n> ${signal} received — stopping collector`);
    task.stop();
    pool.end().then(() => process.exit(0));
  });
}
