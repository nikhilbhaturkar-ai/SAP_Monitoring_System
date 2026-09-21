import nodemailer from 'nodemailer';
import { pool } from '../db.js';

/**
 * Checks if current time is within office hours in specified timezone.
 */
export function isWithinOfficeHours(startTimeStr, endTimeStr, timezoneStr) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneStr || 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const timeParts = formatter.format(now).split(':');
    const currentMins = parseInt(timeParts[0], 10) * 60 + parseInt(timeParts[1], 10);

    const [sHour, sMin] = (startTimeStr || '09:00').split(':').map(Number);
    const [eHour, eMin] = (endTimeStr || '18:00').split(':').map(Number);

    const startMins = sHour * 60 + sMin;
    const endMins = eHour * 60 + eMin;

    if (startMins <= endMins) {
      return currentMins >= startMins && currentMins <= endMins;
    } else {
      // Overnight office hours (e.g. 22:00 to 06:00)
      return currentMins >= startMins || currentMins <= endMins;
    }
  } catch (err) {
    console.error('[Notifier] Timezone calculation error:', err);
    return true; // Fallback to office hours
  }
}

/**
 * Sends email via nodemailer or logs to console if SMTP is unconfigured.
 */
async function sendNotificationEmail({ to, subject, html, text }) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'sap-monitoring-alerts@company.sap';

  if (host && user) {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({ from, to, subject, text, html });
    console.log(`> [Notifier] Email sent successfully to ${to}`);
  } else {
    console.log('===============================================================');
    console.log(`> [Notifier LOG (Simulated Email Dispatch)]`);
    console.log(`> To: ${to}`);
    console.log(`> Subject: ${subject}`);
    console.log(`> Body:\n${text}`);
    console.log('===============================================================');
  }
}

/**
 * Evaluates critical alerts and dispatches emails to users based on role/plan access.
 */
export async function processAlertNotifications() {
  console.log(`> [Notifier] Evaluating email notifications for latest collection run...`);

  // 1. Fetch system settings
  const { rows: settingsRows } = await pool.query('SELECT key, value FROM system_settings');
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });

  const enableEmail = settings['enable_email_notifications'] === 'true';
  const sendAfterHours = settings['send_critical_after_hours'] === 'true';
  const startStr = settings['office_hours_start'] || '09:00';
  const endStr = settings['office_hours_end'] || '18:00';
  const tzStr = settings['office_hours_timezone'] || 'Asia/Kolkata';

  const inOfficeHours = isWithinOfficeHours(startStr, endStr, tzStr);
  console.log(`> [Notifier] Office hours check: ${inOfficeHours ? 'Inside Office Hours' : 'After Office Hours'} (Timezone: ${tzStr}, Window: ${startStr} - ${endStr})`);

  if (inOfficeHours && !enableEmail) {
    console.log(`> [Notifier] "Enable Email Notifications for Users" is disabled during office hours. Skipping notification dispatch.`);
    return;
  }

  if (!inOfficeHours && !sendAfterHours) {
    console.log(`> [Notifier] "Send Notification for critical alerts after office hours" is disabled. Skipping notification dispatch.`);
    return;
  }

  // 2. Fetch latest monitoring run & anomalies
  const { rows: runRows } = await pool.query('SELECT id, run_date FROM monitoring_runs ORDER BY id DESC LIMIT 1');
  if (runRows.length === 0) {
    console.log(`> [Notifier] No monitoring runs found.`);
    return;
  }

  const latestRunId = runRows[0].id;
  const { rows: anomalyRows } = await pool.query(`
    SELECT 
      o.check_key,
      o.raw_value,
      o.used_gb,
      o.total_gb,
      o.free_gb,
      s.sid,
      s.name AS system_name,
      c.label AS check_label
    FROM observations o
    JOIN systems s ON s.id = o.system_id
    JOIN checks c ON c.key = o.check_key
    WHERE o.run_id = $1 AND o.is_anomaly = TRUE
  `, [latestRunId]);

  if (anomalyRows.length === 0) {
    console.log(`> [Notifier] No critical anomalies detected in run #${latestRunId}.`);
    return;
  }

  console.log(`> [Notifier] Found ${anomalyRows.length} critical anomaly reading(s) in run #${latestRunId}.`);

  // 3. Fetch all active users with email and plan tiles
  const { rows: userRows } = await pool.query(`
    SELECT u.id, u.username, u.name, u.email, u.role, u.plan_id
    FROM users u
    WHERE u.email IS NOT NULL AND TRIM(u.email) != ''
  `);

  const { rows: planTilesRows } = await pool.query('SELECT plan_id, tile_key FROM plan_tiles WHERE is_enabled = TRUE');

  // Build map of plan_id -> Set of tile_keys
  const planTilesMap = new Map();
  planTilesRows.forEach(pt => {
    if (!planTilesMap.has(pt.plan_id)) {
      planTilesMap.set(pt.plan_id, new Set());
    }
    planTilesMap.get(pt.plan_id).add(pt.tile_key);
  });

  // 4. Process notifications per user
  for (const user of userRows) {
    const userAllowedTiles = user.plan_id ? planTilesMap.get(user.plan_id) : null;
    
    // Filter anomalies matching user's plan access
    const userAnomalies = anomalyRows.filter(a => {
      // If user has plan_id, check if check_key is in allowed tiles
      if (userAllowedTiles) {
        return userAllowedTiles.has(a.check_key);
      }
      return true; // if no plan assigned, default all
    });

    if (userAnomalies.length === 0) {
      continue;
    }

    // Check deduplication in sent_notifications table
    const newAlertsForUser = [];

    for (const alert of userAnomalies) {
      const valStr = String(alert.raw_value || `${alert.used_gb}/${alert.total_gb}GB`);
      
      const { rows: existingSent } = await pool.query(`
        SELECT last_value FROM sent_notifications
        WHERE user_id = $1 AND system_sid = $2 AND check_key = $3
      `, [user.id, alert.sid, alert.check_key]);

      if (existingSent.length > 0 && existingSent[0].last_value === valStr) {
        // Status has not changed; skip re-sending same alert
        continue;
      }

      // New alert or changed status
      newAlertsForUser.push({ ...alert, valStr });
    }

    if (newAlertsForUser.length === 0) {
      console.log(`> [Notifier] User ${user.username} (${user.email}): All ${userAnomalies.length} critical alert(s) already notified with no status change.`);
      continue;
    }

    // Construct Email Content
    const subject = `[CRITICAL ALERT] SAP Landscape Monitoring - ${newAlertsForUser.length} Issue(s) Detected (${inOfficeHours ? 'Office Hours' : 'After Office Hours'})`;
    
    let textContent = `Hello ${user.name},\n\n`;
    textContent += `The SAP Monitoring System has detected ${newAlertsForUser.length} critical alert(s) on your assigned tiles:\n\n`;

    let htmlContent = `<div style="font-family: Arial, sans-serif; color: #333;">`;
    htmlContent += `<h2 style="color: #d32f2f;">SAP Landscape Critical Alert Notification</h2>`;
    htmlContent += `<p>Hello <strong>${user.name}</strong>,</p>`;
    htmlContent += `<p>The SAP Monitoring System detected <strong>${newAlertsForUser.length}</strong> critical issue(s) matching your plan access:</p>`;
    htmlContent += `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 650px;">`;
    htmlContent += `<tr style="background-color: #f8f9fa;"><th>System SID</th><th>Check Item</th><th>Current Value / Status</th></tr>`;

    for (const a of newAlertsForUser) {
      textContent += `- [${a.sid}] ${a.check_label} (${a.check_key}): ${a.valStr}\n`;
      htmlContent += `<tr>
        <td><strong>${a.sid}</strong> (${a.system_name})</td>
        <td>${a.check_label} <code>(${a.check_key})</code></td>
        <td style="color: #d32f2f; font-weight: bold;">${a.valStr}</td>
      </tr>`;
    }

    textContent += `\nPlease log in to the dashboard to investigate.\nTime window: ${inOfficeHours ? 'Office Hours' : 'After Office Hours'}\n`;
    htmlContent += `</table>`;
    htmlContent += `<p style="margin-top: 16px; font-size: 12px; color: #666;">Time window: ${inOfficeHours ? 'Office Hours' : 'After Office Hours'} | Timezone: ${tzStr}</p>`;
    htmlContent += `</div>`;

    // Send email
    await sendNotificationEmail({
      to: user.email,
      subject,
      text: textContent,
      html: htmlContent
    });

    // Update sent_notifications state for user
    for (const a of newAlertsForUser) {
      await pool.query(`
        INSERT INTO sent_notifications (user_id, system_sid, check_key, last_value, sent_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, system_sid, check_key)
        DO UPDATE SET last_value = EXCLUDED.last_value, sent_at = NOW()
      `, [user.id, a.sid, a.check_key, a.valStr]);
    }
  }
}
