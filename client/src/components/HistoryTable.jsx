import { StatusDot } from './StatusChip.jsx';

export function HistoryTable({ rows, sid }) {
  if (!rows || rows.length === 0) {
    return <div className="card state-panel">No monitoring runs recorded for {sid}.</div>;
  }

  return (
    <section className="card" style={{ overflow: 'hidden' }} aria-labelledby="history-heading">
      <div className="history-head">
        <span id="history-heading">Run date</span>
        <span>{sid} — outcome</span>
      </div>
      {rows.map((row) => (
        <div className="history-row" key={row.date}>
          <span className="history-date">{row.dateLabel}</span>
          <span className="check-value" style={{ maxWidth: '100%', textAlign: 'left' }}>
            <StatusDot status={row.status} srLabel={row.status === 'ok' ? 'Normal' : 'Attention'} />
            <span>{row.note}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
