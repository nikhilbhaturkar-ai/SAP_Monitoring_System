'use client';

import { useEffect, useRef } from 'react';
import { StatusChip, StatusDot } from './StatusChip.jsx';

const NUMERIC_RE = /^\d+$/;

/**
 * One entry per check that carries row-level detail behind its count/status.
 * `columns` are the table headers; `cells(row)` returns the matching values in
 * the same order. Adding a fifth such check is one entry here — the render
 * logic below stays generic.
 */
const DETAIL_TABLE_SPECS = {
  st22: {
    heading: (n) => `Runtime errors (${n})`,
    caption: (sid) => `ST22 runtime dumps for ${sid}, most recent first`,
    columns: ['When', 'Dump ID', 'Program', 'User', 'Host'],
    cells: (d) => [
      <>
        {d.date ?? '—'}
        {d.time && <span className="detail-sub"> {d.time}</span>}
      </>,
      d.dumpId ?? '—',
      <>
        {d.program ?? '—'}
        {d.include && d.include !== d.program && (
          <span className="detail-sub">
            {' '}
            / {d.include}
            {d.line ? `:${d.line}` : ''}
          </span>
        )}
      </>,
      d.user ?? '—',
      d.host ?? '—',
    ],
  },
  backup: {
    heading: (n) => `Backup log (${n})`,
    caption: (sid) => `Backup runs for ${sid}, most recent first`,
    columns: ['Type', 'Started', 'Ended', 'State'],
    cells: (b) => {
      // entry_state from Z_BACKUP_SRV is literally "successful" or "failed" —
      // same colour + glyph + label convention as every other status in this
      // dashboard (StatusDot), not just plain text, so a failed run stands out
      // in the log without reading every row.
      const isSuccess = /success/i.test(b.state || '');
      return [
        b.type ?? '—',
        b.start ?? '—',
        b.end ?? '—',
        <>
          <StatusDot
            status={isSuccess ? 'ok' : 'critical'}
            srLabel={isSuccess ? 'Successful' : 'Failed'}
          />
          {b.state ?? '—'}
        </>,
      ];
    },
  },
  sm12: {
    heading: (n) => `Active lock entries (${n})`,
    caption: (sid) => `SM12 active lock entries for ${sid}`,
    columns: ['User', 'Table', 'Mode', 'Held since'],
    cells: (l) => [
      l.user ?? '—',
      l.table ?? '—',
      l.mode ?? '—',
      l.durationHrs != null ? `${l.time ?? '—'} (${l.durationHrs}h)` : (l.time ?? '—'),
    ],
  },
  sm51: {
    heading: (n) => `Application servers (${n})`,
    caption: (sid) => `SM51 server list for ${sid}`,
    columns: ['Server', 'Host', 'Address'],
    cells: (s) => [s.name ?? '—', s.hostLong ?? s.host ?? '—', s.hostAddr ?? '—'],
  },
  sm50: {
    heading: (n) => `Work processes (${n})`,
    caption: (sid) => `SM50 work process list for ${sid}`,
    columns: ['#', 'Type', 'Status', 'User', 'Program', 'CPU'],
    cells: (w) => [
      w.index ?? '—',
      w.type ?? '—',
      <>
        {w.status ?? '—'}
        {w.info && <span className="detail-sub"> · {w.info}</span>}
      </>,
      w.user || '—',
      w.program || '—',
      w.cpu ?? '—',
    ],
  },
};

/**
 * Everything the pipeline knows about one flagged check.
 *
 * A native <dialog> rather than a hand-rolled overlay: showModal() brings the
 * focus trap, the Escape key, inertness of the page behind it and the top-layer
 * stacking with it, none of which are worth reimplementing.
 *
 * Row-level detail (dump program, lock owner, server host, backup log entry,
 * …) renders only when the API actually attached `detail.detailRows` AND the
 * tile's key has an entry in DETAIL_TABLE_SPECS — today that's st22, backup,
 * sm12 and sm51, because those are the only tables holding rows like that.
 * Every other flagged check still has no such table, so the closing note
 * keeps pointing at the real transaction for those instead of inventing
 * fields.
 */
export function MetricDetailDialog({ tile, sid, systemName, runLabel, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!node.open) node.showModal();

    /*
     * Escape is handled here rather than through the dialog's own `cancel` /
     * `close` events. Those close the element natively without React hearing
     * about it, which leaves a closed <dialog> still mounted and the tile
     * unable to reopen it (verified: a listener attached to the element never
     * fires). Owning the key means the DOM and the state cannot disagree.
     */
    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      if (node.open) node.close();
    };
  }, [onClose]);

  const detail = tile.detail ?? {};
  const readings = detail.readings ?? [];
  const detailRows = detail.detailRows ?? null;
  const tableSpec = DETAIL_TABLE_SPECS[tile.key] ?? null;
  const hasDetailTable = tableSpec && detailRows && detailRows.length > 0;
  // Some checks (sm51) open their dialog as reference information on a
  // perfectly healthy reading — detail.isAnomaly, not tile.severity, is the
  // true signal, since severity is only ever set on an actual anomaly.
  const isAnomaly = Boolean(detail.isAnomaly);
  const severity = tile.severity === 'critical' ? 'critical' : 'warning';
  const normalTextIsCount = detail.normalText != null && NUMERIC_RE.test(String(detail.normalText));

  // Clicking the backdrop lands on the dialog element itself, never on its
  // contents, which is what separates "outside" from "inside" here. It routes
  // through onClose (not node.close()) for the same reason Escape does.
  const handleClick = (event) => {
    if (event.target === ref.current) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      aria-labelledby="detail-dialog-title"
      onClick={handleClick}
    >
      <header className="detail-head">
        <div>
          <p className="detail-eyebrow">
            {sid} · {systemName}
          </p>
          <h2 className="detail-title" id="detail-dialog-title">
            {tile.label}
          </h2>
        </div>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close details">
          &#215;
        </button>
      </header>

      <div className="detail-banner">
        {/* No explicit label on the chip: it names its own severity, so the
            word, the glyph and the colour cannot disagree. A healthy check
            opened as reference (sm51) gets its real "ok" status here instead
            of borrowing the warning/critical vocabulary built for anomalies. */}
        <StatusChip status={isAnomaly ? severity : tile.status} />
        <span className="detail-reading">{tile.note ?? tile.value}</span>
      </div>

      <dl className="detail-facts">
        <div>
          <dt>Run</dt>
          <dd>{runLabel}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {tile.hasLiveApi ? 'Live SAP API' : 'Imported workbook'}
            {!tile.hasLiveApi && (
              <span className="detail-sub"> · no live API configured for {sid}</span>
            )}
          </dd>
        </div>
        {isAnomaly ? (
          <>
            <div>
              <dt>Flagged since</dt>
              <dd>
                {detail.firstSeenShort ?? '—'}
                {detail.consecutiveRuns > 1 && (
                  <span className="detail-sub"> · {detail.consecutiveRuns} runs in a row</span>
                )}
              </dd>
            </div>
            <div>
              <dt>In the last {detail.runsInWindow ?? 0} runs</dt>
              <dd>
                {detail.occurrencesInWindow ?? 0}
                <span className="detail-sub"> flagged</span>
              </dd>
            </div>
            <div className="detail-fact-wide">
              <dt>Why it is flagged</dt>
              <dd>
                {normalTextIsCount ? (
                  <>
                    The count is above <code className="detail-code">{detail.normalText}</code>,
                    the value this check is healthy at.
                  </>
                ) : detail.normalText ? (
                  <>
                    The reading no longer contains{' '}
                    <code className="detail-code">{detail.normalText}</code>, the phrase this
                    check is healthy on.
                  </>
                ) : (
                  'The reading changed from the value this check is healthy on.'
                )}
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Last {detail.runsInWindow ?? 0} runs</dt>
            <dd>
              All normal
              <span className="detail-sub"> · nothing flagged</span>
            </dd>
          </div>
        )}
      </dl>

      {hasDetailTable && (
        <section className="detail-section">
          <h3 className="detail-subhead">{tableSpec.heading(detailRows.length)}</h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">{tableSpec.caption(sid)}</caption>
              <thead>
                <tr>
                  {tableSpec.columns.map((col) => (
                    <th key={col} scope="col">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row, i) => (
                  // No id from SAP to key on — position is stable within one render.
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={i}>
                    {tableSpec.cells(row).map((cell, j) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {readings.length > 0 && (
        <section className="detail-section">
          <h3 className="detail-subhead">Recent readings</h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">
                {tile.label} readings for {sid}, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Reading</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((reading) => (
                  <tr key={reading.date}>
                    <td>{reading.dateShort}</td>
                    <td>{reading.value}</td>
                    <td>
                      <StatusDot
                        status={reading.isAnomaly ? 'warning' : 'ok'}
                        srLabel={reading.isAnomaly ? 'Flagged' : 'Normal'}
                      />
                      {reading.isAnomaly ? 'Flagged' : 'Normal'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="detail-note">
        {hasDetailTable
          ? 'This is the detail behind the reading above, captured at collection time.'
          : 'This dashboard records the summary line each check reports, not the underlying ' +
            'log.'}{' '}
        For the full detail, open <strong>{tile.label.split(' ')[0]}</strong> in {sid}.
      </p>
    </dialog>
  );
}
