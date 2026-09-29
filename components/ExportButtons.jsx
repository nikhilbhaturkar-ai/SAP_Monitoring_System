'use client';

import { useState } from 'react';

const ICONS = {
  excel: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 18l2.5-3.5L8.5 11h1.6l1.4 2.1 1.4-2.1H14.5l-2.5 3.5 2.5 3.5h-1.6l-1.4-2.1-1.4 2.1H8.5z"/>
    </svg>
  ),
  pdf: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-6h1.5c.8 0 1.5.7 1.5 1.5S10.3 14 9.5 14H9v3H8zm1-4h.5c.3 0 .5-.2.5-.5S9.8 12 9.5 12H9v1zm3 4v-6h1.5C14.3 11 15 11.9 15 13v2c0 1.1-.7 2-1.5 2H12zm1-5v4h.5c.3 0 .5-.4.5-1v-2c0-.6-.2-1-.5-1H13zm3 5v-6h3v1h-2v1h2v1h-2v3h-1z"/>
    </svg>
  ),
  email: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  ),
};

export function ExportButtons({ dashboard, sid, userEmail, userName }) {
  const [state, setState] = useState({ excel: 'idle', pdf: 'idle', email: 'idle' });

  function setOne(key, val) {
    setState(s => ({ ...s, [key]: val }));
  }

  async function handleExcel() {
    if (state.excel !== 'idle') return;
    setOne('excel', 'loading');
    try {
      const res = await fetch('/api/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboard, sid }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `SAP_Dashboard_${sid}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOne('excel', 'done');
      setTimeout(() => setOne('excel', 'idle'), 2500);
    } catch (err) {
      setOne('excel', 'error');
      setTimeout(() => setOne('excel', 'idle'), 3000);
    }
  }

  function handlePdf() {
    if (state.pdf !== 'idle') return;
    setOne('pdf', 'loading');
    try {
      const card = dashboard.systemCard;
      const runLabel = dashboard.latestRun?.label ?? 'N/A';
      const allParams = [
        ...(card?.hardware || []),
        ...(card?.application || []),
        ...(card?.jobs || []),
        ...(card?.health || []),
        ...(card?.params || []),
      ];

      const paramRows = allParams.map(tile => {
        const isAnom = tile.isAnomaly || tile.anomaly;
        const bg = isAnom ? '#fce8e6' : 'transparent';
        const val = tile.value ?? tile.raw ?? tile.rawValue ?? '—';
        return `<tr style="background:${bg}">
          <td>${tile.label ?? tile.key}</td>
          <td style="color:${isAnom ? '#dc2626' : '#16a34a'}">${tile.status ?? '—'}</td>
          <td>${val}</td>
          <td style="text-align:center">${isAnom ? '⚠ Yes' : '✓'}</td>
        </tr>`;
      }).join('');

      const alertRows = [...(dashboard.alerts?.active || []), ...(dashboard.alerts?.recentResolved || [])].map(a => {
        const bg = a.severity === 'critical' ? '#fce8e6' : '#fffbeb';
        return `<tr style="background:${bg}">
          <td>${a.date ?? ''}</td>
          <td>${a.label ?? a.checkKey ?? ''}</td>
          <td>${a.value ?? ''}</td>
          <td>${a.severity ?? ''}</td>
          <td>${a.isActive ? 'Active' : 'Resolved'}</td>
        </tr>`;
      }).join('');

      const epRows = (dashboard.endpoints || []).map(ep => {
        const bg = ep.reachable ? '#f0fdf4' : '#fce8e6';
        return `<tr style="background:${bg}">
          <td>${ep.sid}</td><td>${ep.name}</td>
          <td>${ep.url ?? ep.host ?? ''}</td>
          <td style="color:${ep.reachable ? '#16a34a' : '#dc2626'}">${ep.status}</td>
        </tr>`;
      }).join('');

      const score = card?.score ?? '—';
      const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';

      const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>SAP Dashboard — ${sid}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #1f2937; font-size: 12px; }
  h1 { font-size: 20px; color: #1e3a5f; margin: 0 0 4px; }
  .subtitle { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
  .meta { display: flex; gap: 32px; background: #f8fafd; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px; }
  .meta-item strong { display: block; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
  .meta-item span { font-size: 16px; font-weight: 700; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #1e3a5f; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
  td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  @media print {
    body { padding: 12px; }
    h2 { page-break-before: auto; }
    table { page-break-inside: avoid; }
  }
</style>
</head><body>
<h1>ApxOps — SAP Monitoring Dashboard</h1>
<p class="subtitle">${card?.sid} — ${card?.name} &nbsp;·&nbsp; Run: ${runLabel}</p>
<div class="meta">
  <div class="meta-item"><strong>Health Score</strong><span style="color:${scoreColor}">${score}/100</span></div>
  <div class="meta-item"><strong>Status</strong><span>${card?.status ?? '—'}</span></div>
  <div class="meta-item"><strong>Active Alerts</strong><span style="color:${(dashboard.alerts?.active?.length ?? 0) > 0 ? '#dc2626' : '#16a34a'}">${dashboard.alerts?.active?.length ?? 0}</span></div>
  <div class="meta-item"><strong>Generated</strong><span style="font-size:12px">${new Date(dashboard.generatedAt).toLocaleString('en-GB')}</span></div>
</div>
${paramRows ? `<h2>System Checks</h2><table><tr><th>Check</th><th>Status</th><th>Value</th><th>Anomaly</th></tr>${paramRows}</table>` : ''}
${alertRows ? `<h2>Alerts</h2><table><tr><th>Date</th><th>Check</th><th>Value</th><th>Severity</th><th>State</th></tr>${alertRows}</table>` : ''}
${epRows ? `<h2>Endpoints</h2><table><tr><th>SID</th><th>Name</th><th>URL</th><th>Status</th></tr>${epRows}</table>` : ''}
<div class="footer">© 2026 APx Technology, LLP · ApxOps Autonomous SAP Monitoring</div>
<script>window.onload = function(){ window.print(); }</script>
</body></html>`;

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `SAP_Dashboard_${sid}_${runLabel.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setOne('pdf', 'done');
      setTimeout(() => setOne('pdf', 'idle'), 2500);
    } catch (err) {
      setOne('pdf', 'error');
      setTimeout(() => setOne('pdf', 'idle'), 3000);
    }
  }

  async function handleEmail() {
    if (state.email !== 'idle') return;
    if (!userEmail) {
      alert('No email address found for your account. Please contact your administrator.');
      return;
    }
    setOne('email', 'loading');
    try {
      const res = await fetch('/api/export/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboard, sid, toEmail: userEmail, userName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      setOne('email', 'done');
      setTimeout(() => setOne('email', 'idle'), 3000);
    } catch (err) {
      setOne('email', 'error');
      setTimeout(() => setOne('email', 'idle'), 3000);
    }
  }

  function label(key) {
    if (state[key] === 'loading') return '…';
    if (state[key] === 'done') return '✓';
    if (state[key] === 'error') return '!';
    return null;
  }

  const tooltips = {
    excel: state.excel === 'loading' ? 'Generating Excel…' : state.excel === 'done' ? 'Downloaded!' : state.excel === 'error' ? 'Export failed' : 'Export to Excel (.xlsx)',
    pdf:   state.pdf   === 'loading' ? 'Preparing PDF…'  : state.pdf   === 'done' ? 'PDF opened!'  : state.pdf   === 'error' ? 'Export failed' : 'Export to PDF (print dialog)',
    email: state.email === 'loading' ? 'Sending…'        : state.email === 'done' ? `Sent to ${userEmail}!` : state.email === 'error' ? 'Send failed' : `Email report to ${userEmail || 'your account'}`,
  };

  return (
    <div className="export-btn-group" role="group" aria-label="Export dashboard">
      <button
        type="button"
        className={`export-btn export-btn-excel${state.excel !== 'idle' ? ` export-btn-${state.excel}` : ''}`}
        onClick={handleExcel}
        disabled={state.excel === 'loading'}
        title={tooltips.excel}
        aria-label={tooltips.excel}
      >
        {label('excel') ? <span className="export-btn-state">{label('excel')}</span> : ICONS.excel}
      </button>
      <button
        type="button"
        className={`export-btn export-btn-pdf${state.pdf !== 'idle' ? ` export-btn-${state.pdf}` : ''}`}
        onClick={handlePdf}
        disabled={state.pdf === 'loading'}
        title={tooltips.pdf}
        aria-label={tooltips.pdf}
      >
        {label('pdf') ? <span className="export-btn-state">{label('pdf')}</span> : ICONS.pdf}
      </button>
      <button
        type="button"
        className={`export-btn export-btn-email${state.email !== 'idle' ? ` export-btn-${state.email}` : ''}`}
        onClick={handleEmail}
        disabled={state.email === 'loading' || !userEmail}
        title={tooltips.email}
        aria-label={tooltips.email}
      >
        {label('email') ? <span className="export-btn-state">{label('email')}</span> : ICONS.email}
      </button>
    </div>
  );
}
