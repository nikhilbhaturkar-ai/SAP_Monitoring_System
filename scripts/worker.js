/**
 * Scheduled SAP collector worker job — a standalone daemon process that runs continuous
 * monitoring collection cycles every N minutes (configured dynamically in Admin Settings).
 *
 * Start with `npm run worker` (or `npm run dev`).
 */
import { config } from '../lib/server/config.js';
import { pool } from '../lib/server/db.js';
import { collectOnce } from '../lib/server/services/collector.js';
import { processAlertNotifications } from '../lib/server/services/notifier.js';
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

async function getRefreshIntervalMins() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'refresh_interval_mins'"
    );
    if (rows.length > 0 && rows[0].value) {
      const val = parseInt(rows[0].value, 10);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch (err) {
    console.error('Failed to read refresh interval from DB, using default 15m:', err.message);
  }
  return 15; // default 15 minutes
}

async function runSingleCycle() {
  console.log(`> [${new Date().toISOString()}] SAP worker job collection started.`);

  if (!config.sap.enabled) {
    console.warn(
      '> SAP_ENABLED is not "true": endpoints are unconfigured, so the worker will ' +
        'record a skipped run and write no observations.'
    );
  }

  if (!isVpnConnected()) {
    console.error('Collection skipped: FortiClient VPN is not connected.');
    return;
  }

  try {
    await collectOnce();
    console.log(`> [${new Date().toISOString()}] SAP worker job collection finished successfully.`);

    // Evaluate and dispatch critical alert notifications based on user plan & office hours
    await processAlertNotifications();
  } catch (err) {
    console.error('Collection failed:', err.message);
  }
}

async function startWorkerDaemon() {
  console.log('====================================================');
  console.log('  SAP Monitoring Worker Job Daemon Started');
  console.log('====================================================');

  while (true) {
    const intervalMins = await getRefreshIntervalMins();
    console.log(`> Scheduling collection cycle every ${intervalMins} minute(s)...`);

    await runSingleCycle();

    const intervalMs = intervalMins * 60 * 1000;
    const nextRunTime = new Date(Date.now() + intervalMs).toLocaleTimeString();
    console.log(`> [Worker Daemon] Waiting ${intervalMins} mins until next run (at ${nextRunTime})...`);

    // Sleep for the configured interval
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n> Worker Daemon shutting down...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n> Worker Daemon terminating...');
  await pool.end();
  process.exit(0);
});

startWorkerDaemon().catch((err) => {
  console.error('Fatal worker daemon error:', err);
  pool.end();
  process.exit(1);
});
