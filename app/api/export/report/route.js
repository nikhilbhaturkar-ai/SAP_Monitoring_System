import { NextResponse } from 'next/server';
import { query } from '../../../../lib/server/db.js';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

// ── helpers ──────────────────────────────────────────────────────────────────
const headerFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
const headerFont  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FB' } };
const boldFont    = { bold: true, size: 10 };
const normalFont  = { size: 10 };
const warnFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
const critFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE8E6' } };
const goodFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } };
const border = {
  top:    { style: 'thin', color: { argb: 'FFD0D0D0' } },
  left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
  bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
};

function hdr(ws, cols) {
  const row = ws.addRow(cols);
  row.eachCell(cell => {
    cell.fill = headerFill; cell.font = headerFont;
    cell.border = border;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 22;
}

function styleRow(row, fill) {
  row.eachCell(cell => {
    if (fill) cell.fill = fill;
    cell.font = normalFont; cell.border = border;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

// ── fetch observations across a date range ───────────────────────────────────
async function fetchRangeObservations(sid, dateFrom, dateTo, tileKeys) {
  const tileFilter = tileKeys?.length
    ? `AND c.key = ANY($4::text[])`
    : '';

  const params = [sid.toUpperCase(), dateFrom, dateTo];
  if (tileKeys?.length) params.push(tileKeys);

  const { rows } = await query(`
    SELECT
      dr.run_date,
      c.key        AS check_key,
      c.label      AS check_label,
      o.raw_value,
      o.is_anomaly,
      o.used_gb,
      o.free_gb,
      o.total_gb
    FROM daily_runs dr
    JOIN observations o  ON o.run_id    = dr.id
    JOIN systems     s   ON s.id        = o.system_id
    JOIN checks      c   ON c.key       = o.check_key
    WHERE s.sid         = $1
      AND dr.run_date  >= $2::date
      AND dr.run_date  <= $3::date
      ${tileFilter}
    ORDER BY dr.run_date DESC, c.sort_order
  `, params);

  return rows;
}

async function fetchAlertsRange(sid, dateFrom, dateTo) {
  const { rows } = await query(`
    SELECT
      dr.run_date,
      c.label  AS check_label,
      o.raw_value,
      o.is_anomaly
    FROM daily_runs dr
    JOIN observations o ON o.run_id    = dr.id
    JOIN systems     s  ON s.id        = o.system_id
    JOIN checks      c  ON c.key       = o.check_key
    WHERE s.sid        = $1
      AND dr.run_date >= $2::date
      AND dr.run_date <= $3::date
      AND o.is_anomaly = TRUE
    ORDER BY dr.run_date DESC, c.sort_order
  `, [sid.toUpperCase(), dateFrom, dateTo]);
  return rows;
}

// ── Excel builder ─────────────────────────────────────────────────────────────
async function buildExcel(sid, dateFrom, dateTo, tileKeys, checkLabels) {
  const [obs, alerts] = await Promise.all([
    fetchRangeObservations(sid, dateFrom, dateTo, tileKeys),
    fetchAlertsRange(sid, dateFrom, dateTo),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ApxOps SAP Monitoring';
  wb.created = new Date();

  // ── Sheet 1: Cover / Summary ──────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Report Summary');
  ws1.columns = [{ width: 28 }, { width: 42 }];

  ws1.mergeCells('A1:B1');
  const title = ws1.getCell('A1');
  title.value = 'ApxOps — SAP Monitoring Report';
  title.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
  ws1.getRow(1).height = 30;
  ws1.addRow([]);

  const meta = [
    ['System (SID)',   sid.toUpperCase()],
    ['Report Period',  `${dateFrom}  →  ${dateTo}`],
    ['Tiles Included', tileKeys?.length ? checkLabels.join(', ') : 'All tiles'],
    ['Generated At',   new Date().toLocaleString('en-GB')],
    ['Total Readings', obs.length],
    ['Total Anomalies', alerts.length],
  ];
  for (const [label, value] of meta) {
    const row = ws1.addRow([label, value]);
    row.getCell(1).font = boldFont;
    row.getCell(1).fill = sectionFill;
    row.getCell(2).font = normalFont;
    row.eachCell(c => { c.border = border; });
  }

  // ── Sheet 2: All Observations ─────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Observations');
  ws2.columns = [
    { width: 14 }, { width: 32 }, { width: 40 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ];
  hdr(ws2, ['Run Date', 'Check', 'Value', 'Anomaly', 'Used GB', 'Free GB', 'Total GB']);
  for (const r of obs) {
    const fill = r.is_anomaly ? critFill : null;
    const row = ws2.addRow([
      r.run_date, r.check_label, r.raw_value,
      r.is_anomaly ? 'Yes' : 'No',
      r.used_gb ?? '', r.free_gb ?? '', r.total_gb ?? '',
    ]);
    styleRow(row, fill);
  }

  // ── Sheet 3: Anomalies Only ───────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Anomalies');
  ws3.columns = [{ width: 14 }, { width: 32 }, { width: 48 }];
  hdr(ws3, ['Run Date', 'Check', 'Anomalous Value']);
  for (const r of alerts) {
    const row = ws3.addRow([r.run_date, r.check_label, r.raw_value]);
    styleRow(row, warnFill);
  }
  if (alerts.length === 0) {
    const row = ws3.addRow(['—', 'No anomalies in selected period', '']);
    styleRow(row, goodFill);
  }

  // ── Sheet 4: Daily Summary (pivot by date) ────────────────────────────────
  const ws4 = wb.addWorksheet('Daily Summary');
  const dates = [...new Set(obs.map(r => r.run_date))].sort();
  ws4.columns = [{ width: 14 }, { width: 20 }, { width: 20 }];
  hdr(ws4, ['Run Date', 'Total Readings', 'Anomalies']);
  for (const d of dates) {
    const dayObs = obs.filter(r => r.run_date === d);
    const dayAnom = dayObs.filter(r => r.is_anomaly);
    const row = ws4.addRow([d, dayObs.length, dayAnom.length]);
    styleRow(row, dayAnom.length > 0 ? warnFill : goodFill);
  }

  return wb;
}

// ── PDF HTML builder ──────────────────────────────────────────────────────────
async function buildPdfHtml(sid, dateFrom, dateTo, tileKeys, checkLabels) {
  const [obs, alerts] = await Promise.all([
    fetchRangeObservations(sid, dateFrom, dateTo, tileKeys),
    fetchAlertsRange(sid, dateFrom, dateTo),
  ]);

  const dates = [...new Set(obs.map(r => r.run_date))].sort().reverse();

  const rowsHtml = obs.map(r => `
    <tr class="${r.is_anomaly ? 'anom' : ''}">
      <td>${r.run_date}</td>
      <td>${r.check_label}</td>
      <td>${r.raw_value ?? ''}</td>
      <td>${r.is_anomaly ? '⚠ Yes' : 'No'}</td>
    </tr>`).join('');

  const dailyHtml = dates.map(d => {
    const dayObs  = obs.filter(r => r.run_date === d);
    const dayAnom = dayObs.filter(r => r.is_anomaly);
    return `<tr class="${dayAnom.length > 0 ? 'anom' : 'ok'}">
      <td>${d}</td><td>${dayObs.length}</td><td>${dayAnom.length}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>ApxOps Report — ${sid} — ${dateFrom} to ${dateTo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
  h1 { font-size: 18px; color: #1e3a5f; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #1e3a5f; margin: 20px 0 8px; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px; }
  .meta { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; margin-bottom: 12px; }
  .meta b { color: #475569; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #1e3a5f; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  tr.anom td { background: #fff3cd; }
  tr.ok   td { background: #e6f4ea; }
  @media print { body { padding: 8px; } h2 { page-break-before: auto; } }
</style>
</head><body>
<h1>ApxOps — SAP Monitoring Report</h1>
<div class="meta">
  <b>System (SID):</b><span>${sid.toUpperCase()}</span>
  <b>Period:</b><span>${dateFrom} → ${dateTo}</span>
  <b>Tiles:</b><span>${tileKeys?.length ? checkLabels.join(', ') : 'All tiles'}</span>
  <b>Generated:</b><span>${new Date().toLocaleString('en-GB')}</span>
  <b>Total Readings:</b><span>${obs.length}</span>
  <b>Anomalies:</b><span>${alerts.length}</span>
</div>

<h2>Daily Summary</h2>
<table><thead><tr><th>Date</th><th>Readings</th><th>Anomalies</th></tr></thead>
<tbody>${dailyHtml || '<tr><td colspan="3">No data in range</td></tr>'}</tbody></table>

<h2>All Observations</h2>
<table><thead><tr><th>Date</th><th>Check</th><th>Value</th><th>Anomaly</th></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="4">No observations found</td></tr>'}</tbody></table>
</body></html>`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { sid, dateFrom, dateTo, tileKeys = [], format = 'excel' } = await req.json();
    if (!sid) return NextResponse.json({ error: 'sid required' }, { status: 400 });

    const from = dateFrom || new Date().toISOString().slice(0, 10);
    const to   = dateTo   || new Date().toISOString().slice(0, 10);

    // Resolve check labels for selected keys
    let checkLabels = [];
    if (tileKeys.length) {
      const { rows } = await query(
        `SELECT key, label FROM checks WHERE key = ANY($1::text[]) ORDER BY sort_order`,
        [tileKeys]
      );
      checkLabels = rows.map(r => r.label);
    }

    if (format === 'pdf') {
      const html = await buildPdfHtml(sid, from, to, tileKeys, checkLabels);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="SAP_Report_${sid}_${from}_${to}.html"`,
        },
      });
    }

    // Default: Excel
    const wb = await buildExcel(sid, from, to, tileKeys, checkLabels);
    const buf = await wb.xlsx.writeBuffer();
    const filename = `SAP_Report_${sid}_${from}_to_${to}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[Export/Report]', err);
    return NextResponse.json({ error: err.message || 'report failed' }, { status: 500 });
  }
}
