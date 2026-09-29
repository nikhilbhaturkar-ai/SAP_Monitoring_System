import nodemailer from 'nodemailer';
import { pool } from '../db.js';

let _transporter = null;
let _transporterKey = '';

function getTransporter() {
  const host = process.env.SMTP_HOST || '';
  const port = process.env.SMTP_PORT || '587';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const cacheKey = `${host}:${port}:${user}`;

  if (!host || !user) return null;
  if (_transporter && _transporterKey === cacheKey) return _transporter;

  _transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  _transporterKey = cacheKey;
  return _transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || 'sap-monitoring-alerts@company.sap';
  const transporter = getTransporter();

  if (transporter) {
    await transporter.sendMail({ from, to, subject, text, html });
    console.log(`> [Notifier] Email sent to ${to}`);
  } else {
    console.log('='.repeat(64));
    console.log(`> [Notifier] Simulated email — To: ${to} | Subject: ${subject}`);
    console.log(text);
    console.log('='.repeat(64));
  }
}

async function loadSettings() {
  const { rows } = await pool.query('SELECT key, value FROM system_settings');
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return {
    enableEmail: s['enable_email_notifications'] === 'true',
    dailyEmailHour: s['daily_email_hour'] ? parseInt(s['daily_email_hour'], 10) : 8,
    dailyEmailTimezone: s['daily_email_timezone'] || 'Asia/Kolkata',
    alertCheckKeys: s['alert_check_keys'] ? s['alert_check_keys'].split(',').filter(Boolean) : [],
  };
}

/**
 * Returns the current hour (0–23) in the given IANA timezone.
 */
function currentHourIn(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const h = parts.find(p => p.type === 'hour');
    return h ? parseInt(h.value, 10) : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

async function fetchUsersWithPlans() {
  const { rows: userRows } = await pool.query(`
    SELECT u.id, u.username, u.name, u.email, u.plan_id
    FROM users u
    WHERE u.email IS NOT NULL AND TRIM(u.email) != ''
  `);
  const { rows: planTilesRows } = await pool.query(
    'SELECT plan_id, tile_key FROM plan_tiles WHERE is_enabled = TRUE'
  );
  const planTilesMap = new Map();
  planTilesRows.forEach(pt => {
    if (!planTilesMap.has(pt.plan_id)) planTilesMap.set(pt.plan_id, new Set());
    planTilesMap.get(pt.plan_id).add(pt.tile_key);
  });
  return { userRows, planTilesMap };
}

/**
 * Per-cycle: runs after every collection cycle.
 * Sends email for anomalies on the selected alert check keys only.
 */
export async function processCycleAlerts() {
  const settings = await loadSettings();

  if (!settings.enableEmail) {
    console.log('> [Notifier] Email disabled — skipping cycle alert check.');
    return;
  }

  if (settings.alertCheckKeys.length === 0) {
    console.log('> [Notifier] No alert parameters selected — skipping cycle alert check.');
    return;
  }

  // Fetch anomalies from the latest run for the selected check keys only
  const { rows: runRows } = await pool.query(
    'SELECT id FROM monitoring_runs ORDER BY id DESC LIMIT 1'
  );
  if (runRows.length === 0) {
    console.log('> [Notifier] No monitoring runs found.');
    return;
  }

  const latestRunId = runRows[0].id;
  const placeholders = settings.alertCheckKeys.map((_, i) => `$${i + 2}`).join(',');
  const { rows: anomalyRows } = await pool.query(`
    SELECT o.check_key, o.raw_value, o.used_gb, o.total_gb, o.free_gb,
           s.sid, s.name AS system_name, c.label AS check_label
    FROM observations o
    JOIN systems s ON s.id = o.system_id
    JOIN checks c  ON c.key = o.check_key
    WHERE o.run_id = $1
      AND o.is_anomaly = TRUE
      AND o.check_key IN (${placeholders})
  `, [latestRunId, ...settings.alertCheckKeys]);

  if (anomalyRows.length === 0) {
    console.log(`> [Notifier] No anomalies on selected parameters in run #${latestRunId}.`);
    return;
  }

  console.log(`> [Notifier] ${anomalyRows.length} anomaly/ies found on monitored parameters.`);

  const { userRows, planTilesMap } = await fetchUsersWithPlans();

  for (const user of userRows) {
    try {
      const allowedTiles = user.plan_id ? planTilesMap.get(user.plan_id) : null;
      const userAnomalies = anomalyRows.filter(a =>
        allowedTiles ? allowedTiles.has(a.check_key) : true
      );
      if (userAnomalies.length === 0) continue;

      const subject = `[SAP Alert] ${userAnomalies.length} monitored parameter(s) critical`;
      let text = `Hello ${user.name},\n\nThe following monitored SAP parameters are currently critical:\n\n`;
      let html = `<div style="font-family:Arial,sans-serif;color:#333">
        <h2 style="color:#d32f2f">SAP Monitoring — Critical Alert</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>The following monitored parameters are currently critical:</p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:650px">
        <tr style="background:#f8f9fa"><th>System</th><th>Parameter</th><th>Value</th></tr>`;

      for (const a of userAnomalies) {
        const val = a.raw_value || `${a.used_gb}/${a.total_gb} GB`;
        text += `  [${a.sid}] ${a.check_label}: ${val}\n`;
        html += `<tr>
          <td><strong>${a.sid}</strong> — ${a.system_name}</td>
          <td>${a.check_label} <code>(${a.check_key})</code></td>
          <td style="color:#d32f2f;font-weight:bold">${val}</td>
        </tr>`;
      }

      text += '\nLog in to the dashboard to investigate.\n';
      html += `</table><p style="margin-top:16px;font-size:12px;color:#666">
        Generated at ${new Date().toISOString()}</p></div>`;

      await sendEmail({ to: user.email, subject, text, html });
    } catch (err) {
      console.error(`> [Notifier] Failed for user ${user.username}:`, err.message);
    }
  }
}

// Track the last hour the daily digest was sent to avoid double-sending within the same hour
let _lastDailyDigestHour = -1;
let _lastDailyDigestDate = '';

/**
 * Daily digest: called after each collection cycle.
 * Sends one email per user at the configured hour in the configured timezone.
 */
export async function processDailyDigest() {
  const settings = await loadSettings();

  if (!settings.enableEmail) return;

  const tz = settings.dailyEmailTimezone;
  const targetHour = settings.dailyEmailHour;
  const nowHour = currentHourIn(tz);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD

  // Only send once per day in the target hour
  if (nowHour !== targetHour) return;
  if (_lastDailyDigestDate === today && _lastDailyDigestHour === targetHour) return;

  console.log(`> [Notifier] Sending daily digest (hour=${targetHour}, tz=${tz})…`);
  _lastDailyDigestHour = targetHour;
  _lastDailyDigestDate = today;

  // Fetch today's anomalies across all latest runs
  const { rows: anomalyRows } = await pool.query(`
    SELECT DISTINCT ON (s.sid, o.check_key)
           o.check_key, o.raw_value, o.used_gb, o.total_gb, o.free_gb, o.is_anomaly,
           s.sid, s.name AS system_name, c.label AS check_label
    FROM observations o
    JOIN daily_runs dr ON dr.id = o.run_id
    JOIN systems s     ON s.id = o.system_id
    JOIN checks c      ON c.key = o.check_key
    WHERE dr.run_date = $1
    ORDER BY s.sid, o.check_key, dr.run_at DESC
  `, [today]);

  const criticalRows = anomalyRows.filter(r => r.is_anomaly);

  const { userRows, planTilesMap } = await fetchUsersWithPlans();

  for (const user of userRows) {
    try {
      const allowedTiles = user.plan_id ? planTilesMap.get(user.plan_id) : null;
      const userCritical = criticalRows.filter(a =>
        allowedTiles ? allowedTiles.has(a.check_key) : true
      );

      const subject = userCritical.length > 0
        ? `[SAP Daily Report] ${userCritical.length} issue(s) detected — ${today}`
        : `[SAP Daily Report] All systems healthy — ${today}`;

      let text = `Hello ${user.name},\n\nSAP Monitoring Daily Summary for ${today}\n\n`;
      let html = `<div style="font-family:Arial,sans-serif;color:#333">
        <h2>SAP Monitoring — Daily Summary</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>Date: <strong>${today}</strong></p>`;

      if (userCritical.length === 0) {
        text += 'All monitored parameters are healthy. No issues detected.\n';
        html += `<p style="color:#2e7d32;font-weight:bold">✓ All monitored parameters are healthy.</p>`;
      } else {
        text += `${userCritical.length} issue(s) detected:\n\n`;
        html += `<p style="color:#d32f2f">⚠ ${userCritical.length} issue(s) detected:</p>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:650px">
          <tr style="background:#f8f9fa"><th>System</th><th>Parameter</th><th>Value</th></tr>`;
        for (const a of userCritical) {
          const val = a.raw_value || `${a.used_gb}/${a.total_gb} GB`;
          text += `  [${a.sid}] ${a.check_label}: ${val}\n`;
          html += `<tr>
            <td><strong>${a.sid}</strong></td>
            <td>${a.check_label}</td>
            <td style="color:#d32f2f">${val}</td>
          </tr>`;
        }
        html += `</table>`;
      }

      text += '\nLog in to the dashboard for details.\n';
      html += `<p style="margin-top:16px;font-size:12px;color:#666">
        Sent at ${new Date().toLocaleString('en-US', { timeZone: tz })} (${tz})</p></div>`;

      await sendEmail({ to: user.email, subject, text, html });
    } catch (err) {
      console.error(`> [Notifier] Daily digest failed for ${user.username}:`, err.message);
    }
  }
}

/**
 * Called after every collection cycle from worker.js.
 */
export async function processAlertNotifications() {
  await processCycleAlerts();
  await processDailyDigest();
}
