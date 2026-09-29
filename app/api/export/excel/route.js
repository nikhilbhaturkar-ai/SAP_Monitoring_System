import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function POST(request) {
  try {
    const { dashboard, sid } = await request.json();
    if (!dashboard) {
      return NextResponse.json({ error: 'dashboard payload required' }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ApxOps SAP Monitoring';
    wb.created = new Date();

    const card = dashboard.systemCard;
    const runLabel = dashboard.latestRun?.label ?? 'N/A';

    // ── Helper styles ─────────────────────────────────────────────────────────
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FB' } };
    const boldFont = { bold: true, size: 10 };
    const normalFont = { size: 10 };
    const warnFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    const critFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE8E6' } };
    const goodFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } };
    const border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    };

    function addHeaderRow(ws, cols) {
      const row = ws.addRow(cols);
      row.eachCell(cell => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      row.height = 22;
    }

    function styleDataRow(row, fillStyle) {
      row.eachCell(cell => {
        if (fillStyle) cell.fill = fillStyle;
        cell.font = normalFont;
        cell.border = border;
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
    }

    // ── Sheet 1: Summary ─────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Summary');
    ws1.columns = [
      { width: 26 }, { width: 40 }, { width: 20 }, { width: 20 },
    ];

    ws1.mergeCells('A1:D1');
    const titleCell = ws1.getCell('A1');
    titleCell.value = `ApxOps — SAP Monitoring Dashboard Export`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
    ws1.getRow(1).height = 28;

    ws1.addRow([]);

    const metaRows = [
      ['System', `${card?.sid} — ${card?.name}`],
      ['Run Date', runLabel],
      ['Health Score', `${card?.score ?? '—'} / 100`],
      ['System Status', card?.status ?? '—'],
      ['Active Alerts', String(dashboard.alerts?.active?.length ?? 0)],
      ['Total Alerts in Window', String(dashboard.alerts?.totalInWindow ?? 0)],
      ['Generated At', new Date(dashboard.generatedAt).toLocaleString('en-GB')],
    ];
    for (const [label, value] of metaRows) {
      const row = ws1.addRow([label, value]);
      row.getCell(1).font = boldFont;
      row.getCell(2).font = normalFont;
      row.getCell(1).fill = sectionFill;
      row.eachCell(c => { c.border = border; });
    }

    ws1.addRow([]);
    addHeaderRow(ws1, ['Check', 'Status', 'Value', 'Anomaly']);

    const allParams = [
      ...(card?.hardware || []),
      ...(card?.application || []),
      ...(card?.jobs || []),
      ...(card?.health || []),
      ...(card?.params || []),
    ];

    for (const tile of allParams) {
      const isAnom = tile.isAnomaly || tile.anomaly;
      const row = ws1.addRow([
        tile.label ?? tile.key,
        tile.status ?? '',
        tile.value ?? tile.raw ?? '',
        isAnom ? 'Yes' : 'No',
      ]);
      styleDataRow(row, isAnom ? critFill : null);
    }

    // ── Sheet 2: Alerts ──────────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Alerts');
    ws2.columns = [
      { width: 20 }, { width: 22 }, { width: 50 }, { width: 14 }, { width: 14 },
    ];

    ws2.mergeCells('A1:E1');
    const a1 = ws2.getCell('A1');
    a1.value = 'Active & Recent Alerts';
    a1.font = { bold: true, size: 12 };
    a1.fill = sectionFill;
    ws2.getRow(1).height = 22;

    ws2.addRow([]);
    addHeaderRow(ws2, ['Date', 'Check', 'Value', 'Severity', 'Active']);

    const allAlerts = [
      ...(dashboard.alerts?.active || []),
      ...(dashboard.alerts?.recentResolved || []),
    ];
    for (const alert of allAlerts) {
      const fill = alert.severity === 'critical' ? critFill : warnFill;
      const row = ws2.addRow([
        alert.date ?? '',
        alert.label ?? alert.checkKey ?? '',
        alert.value ?? '',
        alert.severity ?? '',
        alert.isActive ? 'Yes' : 'No',
      ]);
      styleDataRow(row, fill);
    }

    // ── Sheet 3: Endpoints ───────────────────────────────────────────────────
    const ws3 = wb.addWorksheet('Endpoints');
    ws3.columns = [
      { width: 14 }, { width: 28 }, { width: 40 }, { width: 18 },
    ];
    addHeaderRow(ws3, ['SID', 'Name', 'URL', 'Status']);
    for (const ep of (dashboard.endpoints || [])) {
      const row = ws3.addRow([ep.sid, ep.name, ep.url ?? ep.host, ep.status]);
      styleDataRow(row, ep.reachable ? goodFill : critFill);
    }

    // ── Sheet 4: Volume Metrics ───────────────────────────────────────────────
    const ws4 = wb.addWorksheet('Volume Metrics');
    ws4.columns = [
      { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];
    addHeaderRow(ws4, ['Metric', 'Used (GB)', 'Free (GB)', 'Total (GB)', '% Used']);
    for (const key of ['dataVol', 'logVol', 'freeApp', 'freeDb']) {
      const m = card?.[key];
      if (!m) continue;
      const row = ws4.addRow([
        m.label ?? key,
        m.usedGB ?? m.used ?? '',
        m.freeGB ?? m.free ?? '',
        m.totalGB ?? m.total ?? '',
        m.percent != null ? `${m.percent}%` : '',
      ]);
      styleDataRow(row, null);
    }

    const buf = await wb.xlsx.writeBuffer();
    const filename = `SAP_Dashboard_${sid}_${runLabel.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[Export/Excel]', err);
    return NextResponse.json({ error: err.message || 'export failed' }, { status: 500 });
  }
}
