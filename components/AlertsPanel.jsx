import { StatusChip, StatusDot } from './StatusChip.jsx';

export function AlertsPanel({ alerts, sid, windowDays }) {
  const active = alerts.active ?? [];
  const resolved = alerts.recentResolved ?? [];
  const hasActive = active.length > 0;

  return (
    <section className="card card-pad stack-gap" aria-labelledby="alerts-heading">
      <div className="alerts-head">
        <h2 className="alerts-title" id="alerts-heading">
          <StatusChip
            status={hasActive ? 'warning' : 'good'}
            label={hasActive ? 'Active alerts' : 'No active alerts'}
          />
        </h2>
        <span className="chart-sub">
          {hasActive ? `${active.length} open` : 'All clear'} · {alerts.totalInWindow} in last{' '}
          {windowDays} runs
        </span>
      </div>

      {hasActive ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {active.map((alert, i) => (
            <div className="alert-row" key={`${alert.date}-${alert.label}-${i}`}>
              <StatusDot status={alert.severity} srLabel={alert.severity} />
              <span className="alert-date">{alert.dateShort}</span>
              <span className="alert-body">
                <strong>{alert.label}</strong> — {alert.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>
          All monitored parameters for <strong>{sid}</strong> were within normal range on the
          latest run.
        </p>
      )}

      {resolved.length > 0 && (
        <div className="divider-top">
          <div className="subcard-title">Recently resolved</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {resolved.map((alert, i) => (
              <div className="alert-row alert-resolved" key={`${alert.date}-${alert.label}-${i}`}>
                <StatusDot status="info" srLabel="Resolved" />
                <span className="alert-date">{alert.dateShort}</span>
                <span className="alert-body">
                  {alert.label} — {alert.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
