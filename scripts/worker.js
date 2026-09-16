/**
 * Scheduled SAP collector — a standalone process, deliberately separate from
 * the Next.js app so a slow SAP host or a crashed cycle never touches the
 * request-handling event loop, and restarting the web app does not reset the
 * schedule.
 *
 * Start with `npm run worker` (or `npm run dev`, which runs it alongside the
 * Next.js dev server and the batch backend).
 */
import { config } from '../lib/server/config.js';
import { pool } from '../lib/server/db.js';
import { collectOnce } from '../lib/server/services/collector.js';
import { execSync } from 'child_process';

function isVpnConnected() {
  try {
    const out = execSync('ipconfig /all', { encoding: 'utf8' });
    const fortinet = out.split(/(?=[a-zA-Z\s]+ adapter )/).find(b => b.includes('Fortinet'));
    if (!fortinet) return false;
    return !fortinet.includes('Media disconnected');
  } catch (err) {
    console.error('Failed to check VPN status:', err.message);
    return false;
  }
}

async function run() {
  console.log(`> [${new Date().toISOString()}] SAP collection started`);
  
  if (!config.sap.enabled) {
    console.warn(
      '> SAP_ENABLED is not "true": endpoints are unconfigured, so the worker will ' +
        'record a skipped run and write no observations.'
    );
  }

  if (!isVpnConnected()) {
    console.error('collection failed: FortiClient VPN is not connected. Skipping SAP API fetch.');
    await pool.end();
    process.exit(1);
  }

  try {
    await collectOnce();
    console.log(`> [${new Date().toISOString()}] collection finished successfully.`);
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('collection failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

run();
