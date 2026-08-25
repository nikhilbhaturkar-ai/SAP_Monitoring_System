/**
 * One-shot SAP collection — the same cycle the worker runs on its schedule.
 * Useful for testing endpoint configuration without waiting for a cron tick.
 *
 *   npm run collect
 */
import { pool } from '../lib/server/db.js';
import { config } from '../lib/server/config.js';
import { collectOnce } from '../lib/server/services/collector.js';

async function run() {
  console.log(`> connecting to ${config.databaseUrl.replace(/:[^:@/]+@/, ':***@')}`);
  const summary = await collectOnce();
  console.log(`> finished with status "${summary.status}"`);
}

run()
  .catch((err) => {
    console.error('collection failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
