'use client';

import { useEffect, useRef } from 'react';
import { StatusDot } from './StatusChip.jsx';

function idocStatusMeta(status) {
  const s = String(status ?? '').trim();
  // IDoc status codes: 01/03/12/16/53 = OK family; 02/04/25/26/51 = error family
  const errorCodes = new Set(['02', '04', '25', '26', '51', '56', '63', '68', '69', '75']);
  const okCodes = new Set(['01', '03', '05', '06', '12', '16', '49', '53']);
  if (errorCodes.has(s)) return { status: 'critical', label: `Error (${s})` };
  if (okCodes.has(s)) return { status: 'ok', label: `OK (${s})` };
  return { status: 'info', label: s || '—' };
}

const DETAILS_COLUMNS = ['IDoc Number', 'Direction', 'Status', 'Date', 'Time', 'Partner', 'Message Type'];
const VOLUME_COLUMNS = ['Message Type', 'Direction', 'Count', 'Date'];

export function IDocDetailDialog({ tile, sid, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!node.open) node.showModal();

    const handleKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (node.open) node.close();
    };
  }, [onClose]);

  const handleClick = (e) => { if (e.target === ref.current) onClose(); };

  const details = tile.idocDetails ?? [];
  const volume  = tile.idocVolume  ?? [];

  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      aria-labelledby="idoc-detail-title"
      onClick={handleClick}
    >
      <header className="detail-head">
        <div>
          <p className="detail-eyebrow">{sid} · IDoc Monitoring</p>
          <h2 className="detail-title" id="idoc-detail-title">{tile.label}</h2>
        </div>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close details">
          &#215;
        </button>
      </header>

      <div className="detail-banner">
        <StatusDot status={tile.status} srLabel={tile.statusLabel} />
        <span className="detail-reading" style={{ fontWeight: 600, fontSize: '1.1rem' }}>
          {tile.value}
        </span>
        <span className="detail-sub" style={{ marginLeft: 8 }}>{tile.statusLabel}</span>
      </div>

      <dl className="detail-facts">
        <div>
          <dt>Hint</dt>
          <dd>{tile.hint}</dd>
        </div>
      </dl>

      {details.length > 0 && (
        <section className="detail-section">
          <h3 className="detail-subhead">IDoc Details ({details.length})</h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">IDoc detail records for {sid}</caption>
              <thead>
                <tr>
                  {DETAILS_COLUMNS.map((col) => (
                    <th key={col} scope="col">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {details.map((row, i) => {
                  const meta = idocStatusMeta(row.STATUS);
                  return (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={i}>
                      <td>{row.IDOC_NUMBER ?? '—'}</td>
                      <td>{row.DIRECTION === '1' ? 'Outbound' : row.DIRECTION === '2' ? 'Inbound' : (row.DIRECTION ?? '—')}</td>
                      <td>
                        <StatusDot status={meta.status} srLabel={meta.label} />
                        {meta.label}
                      </td>
                      <td>{row.CREATION_DATE ?? '—'}</td>
                      <td>{row.CREATION_TIME ?? '—'}</td>
                      <td>{row.PARTNER ?? '—'}</td>
                      <td>{row.MESSAGE_TYPE ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {volume.length > 0 && (
        <section className="detail-section">
          <h3 className="detail-subhead">IDoc Volume Breakdown ({volume.length})</h3>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="visually-hidden">IDoc volume breakdown for {sid}</caption>
              <thead>
                <tr>
                  {VOLUME_COLUMNS.map((col) => (
                    <th key={col} scope="col">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {volume.map((row, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={i}>
                    <td>{row.MESSAGE_TYPE ?? '—'}</td>
                    <td>{row.DIRECTION === '1' ? 'Outbound' : row.DIRECTION === '2' ? 'Inbound' : (row.DIRECTION ?? '—')}</td>
                    <td>{row.COUNT ?? '—'}</td>
                    <td>{row.DATE ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {details.length === 0 && volume.length === 0 && (
        <p className="detail-note">No detail records were returned by the SAP IDoc service for this KPI.</p>
      )}

      <p className="detail-note">
        For full IDoc processing history, open <strong>WE05</strong> or <strong>WE02</strong> in {sid}.
      </p>
    </dialog>
  );
}
