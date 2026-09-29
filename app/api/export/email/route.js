import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!host || !user) return null;
  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function statusColor(s) {
  if (!s) return '#6b7280';
  const l = s.toLowerCase();
  if (l.includes('critical') || l.includes('fail') || l.includes('down') || l.includes('error') || l.includes('unreachable')) return '#dc2626';
  if (l.includes('warning') || l.includes('anomaly')) return '#d97706';
  return '#16a34a';
}

function buildHtml(dashboard, sid) {
  const card = dashboard.systemCard;
  const runLabel = dashboard.latestRun?.label ?? 'N/A';
  const generatedAt = new Date(dashboard.generatedAt).toLocaleString('en-GB');
  const score = card?.score ?? '—';
  const activeAlerts = dashboard.alerts?.active ?? [];
  const resolvedAlerts = dashboard.alerts?.recentResolved ?? [];
  const endpoints = dashboard.endpoints ?? [];

  const allParams = [
    ...(card?.hardware || []),
    ...(card?.application || []),
    ...(card?.jobs || []),
    ...(card?.health || []),
    ...(card?.params || []),
  ];

  const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';

  const paramRows = allParams.map(tile => {
    const isAnom = tile.isAnomaly || tile.anomaly;
    const bg = isAnom ? '#fce8e6' : '#f9fafb';
    const val = tile.value ?? tile.raw ?? tile.rawValue ?? '—';
    return `
      <tr style="background:${bg}">
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${tile.label ?? tile.key}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${statusColor(tile.status ?? '')}">${tile.status ?? '—'}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${val}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center">${isAnom ? '<span style="color:#dc2626;font-weight:700">&#9888; Yes</span>' : '<span style="color:#16a34a">&#10003;</span>'}</td>
      </tr>`;
  }).join('');

  const alertRows = [...activeAlerts, ...resolvedAlerts].map(a => {
    const sev = a.severity ?? 'warning';
    const bg = sev === 'critical' ? '#fce8e6' : '#fffbeb';
    return `
      <tr style="background:${bg}">
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${a.date ?? ''}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600">${a.label ?? a.checkKey ?? ''}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${a.value ?? ''}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${statusColor(sev)};text-transform:capitalize">${sev}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${a.isActive ? 'Active' : 'Resolved'}</td>
      </tr>`;
  }).join('');

  const epRows = endpoints.map(ep => {
    const bg = ep.reachable ? '#f0fdf4' : '#fce8e6';
    return `
      <tr style="background:${bg}">
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${ep.sid}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${ep.name}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${ep.url ?? ep.host ?? ''}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${ep.reachable ? '#16a34a' : '#dc2626'};font-weight:600">${ep.status}</td>
      </tr>`;
  }).join('');

  const volCards = ['dataVol', 'logVol', 'freeApp', 'freeDb']
    .map(k => card?.[k]).filter(Boolean)
    .map(m => `
      <td style="padding:14px 18px;background:#f0f4f8;border-radius:8px;min-width:130px;text-align:center">
        <div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em">${m.label ?? m.key}</div>
        <div style="font-size:22px;font-weight:700;color:#1e3a5f;margin:4px 0">${m.percent != null ? m.percent + '%' : '—'}</div>
        <div style="font-size:11px;color:#6b7280">${m.usedGB ?? m.used ?? '—'} / ${m.totalGB ?? m.total ?? '—'} GB</div>
      </td>`)
    .join('<td style="width:12px"></td>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAP Dashboard Report — ${card?.sid}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
<tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

  <!-- Header -->
  <tr><td style="background:#1e3a5f;padding:28px 32px">
    <h1 style="margin:0;font-size:22px;color:#fff;letter-spacing:-.02em">ApxOps SAP Monitoring</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#a8c4e0">Dashboard Report — ${card?.sid} (${card?.name})</p>
  </td></tr>

  <!-- Meta chips -->
  <tr><td style="padding:20px 32px;background:#f8fafd;border-bottom:1px solid #e5e7eb">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:24px;font-size:12px;color:#6b7280"><strong style="display:block;color:#374151">Run Date</strong>${runLabel}</td>
        <td style="padding-right:24px;font-size:12px;color:#6b7280"><strong style="display:block;color:#374151">Generated</strong>${generatedAt}</td>
        <td style="padding-right:24px;font-size:12px;color:#6b7280"><strong style="display:block;color:#374151">Health Score</strong><span style="color:${scoreColor};font-weight:700;font-size:16px">${score}/100</span></td>
        <td style="font-size:12px;color:#6b7280"><strong style="display:block;color:#374151">Active Alerts</strong><span style="color:${activeAlerts.length > 0 ? '#dc2626' : '#16a34a'};font-weight:700;font-size:16px">${activeAlerts.length}</span></td>
      </tr>
    </table>
  </td></tr>

  <!-- Volume metrics -->
  ${volCards ? `<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 14px;font-size:14px;color:#1e3a5f;text-transform:uppercase;letter-spacing:.06em">Volume Metrics</h2>
    <table cellpadding="0" cellspacing="8"><tr>${volCards}</tr></table>
  </td></tr>` : ''}

  <!-- Checks grid -->
  ${paramRows ? `<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 14px;font-size:14px;color:#1e3a5f;text-transform:uppercase;letter-spacing:.06em">System Checks</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
      <tr style="background:#1e3a5f">
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff;font-weight:600">Check</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff;font-weight:600">Status</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff;font-weight:600">Value</th>
        <th style="padding:9px 12px;text-align:center;font-size:12px;color:#fff;font-weight:600">Anomaly</th>
      </tr>
      ${paramRows}
    </table>
  </td></tr>` : ''}

  <!-- Alerts -->
  ${(activeAlerts.length + resolvedAlerts.length) > 0 ? `<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 14px;font-size:14px;color:#1e3a5f;text-transform:uppercase;letter-spacing:.06em">Alerts</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
      <tr style="background:#1e3a5f">
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">Date</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">Check</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">Value</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">Severity</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">State</th>
      </tr>
      ${alertRows}
    </table>
  </td></tr>` : ''}

  <!-- Endpoints -->
  ${epRows ? `<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0 0 14px;font-size:14px;color:#1e3a5f;text-transform:uppercase;letter-spacing:.06em">Endpoints</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
      <tr style="background:#1e3a5f">
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">SID</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">Name</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">URL</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#fff">Status</th>
      </tr>
      ${epRows}
    </table>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="padding:20px 32px;background:#f8fafd;text-align:center">
    <p style="margin:0;font-size:11px;color:#9ca3af">© 2026 APx Technology, LLP · Generated by ApxOps Autonomous SAP Monitoring</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export async function POST(request) {
  try {
    const { dashboard, sid, toEmail, userName } = await request.json();
    if (!dashboard || !toEmail) {
      return NextResponse.json({ error: 'dashboard and toEmail required' }, { status: 400 });
    }

    const html = buildHtml(dashboard, sid);
    const runLabel = dashboard.latestRun?.label ?? 'N/A';
    const subject = `SAP Dashboard Report — ${sid} (${runLabel})`;
    const text = `ApxOps SAP Monitoring Dashboard Report for ${sid}.\nRun date: ${runLabel}\nHealth Score: ${dashboard.systemCard?.score ?? '—'}/100\nActive Alerts: ${dashboard.alerts?.active?.length ?? 0}\n\nThis report was generated on ${new Date(dashboard.generatedAt).toLocaleString('en-GB')}.`;

    const transporter = getTransporter();
    const from = process.env.SMTP_FROM || 'sap-monitoring-alerts@company.sap';

    if (transporter) {
      await transporter.sendMail({ from, to: toEmail, subject, html, text });
    } else {
      console.log('===============================================================');
      console.log(`> [Export/Email] Simulated dispatch to ${toEmail}: ${subject}`);
      console.log('===============================================================');
    }

    return NextResponse.json({ success: true, to: toEmail, simulated: !transporter });
  } catch (err) {
    console.error('[Export/Email]', err);
    return NextResponse.json({ error: err.message || 'email failed' }, { status: 500 });
  }
}
