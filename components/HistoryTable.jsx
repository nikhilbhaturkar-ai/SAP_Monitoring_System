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
          {row.anomalies.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {row.anomalies.map((a, i) => (
                // No id to key on — position is stable within one render.
                // eslint-disable-next-line react/no-array-index-key
                <span
                  className="check-value"
                  style={{ maxWidth: '100%', textAlign: 'left' }}
                  key={i}
                >
                  <StatusDot status="warning" srLabel="Attention" />
                  <span>
                    <strong>{a.label}</strong>: {a.value}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <span className="check-value" style={{ maxWidth: '100%', textAlign: 'left' }}>
              <StatusDot status="ok" srLabel="Normal" />
              <span>{row.note}</span>
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
