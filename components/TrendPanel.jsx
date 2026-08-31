import { LineChart } from './LineChart.jsx';

/**
 * Headroom trends. Free memory and consumed capacity are different measures, so
 * they get their own charts on their own axes — never two scales in one frame.
 */
// App-server and database free-memory charts deliberately show a fixed last-10-checks
// window regardless of the dashboard's shared windowDays (which governs alerts/history
// instead) — a longer trend just adds noise to a headroom-at-a-glance chart.
const MEMORY_CHART_CHECKS = 10;

export function TrendPanel({ trends, sid }) {
  const freeAppLast10 = (trends.freeApp ?? []).slice(-MEMORY_CHART_CHECKS);
  const freeDbLast10 = (trends.freeDb ?? []).slice(-MEMORY_CHART_CHECKS);
  const hasDb = freeDbLast10.some((p) => p.value != null);

  return (
    <section className="stack-gap" aria-labelledby="trends-heading">
      <h2 className="section-label" id="trends-heading">
        Memory headroom trend
      </h2>
      <div className="chart-grid">
        <div className="card card-pad">
          <div className="chart-head">
            <span className="chart-title">Free memory — app server ({sid})</span>
            <span className="chart-sub">GB free, last {MEMORY_CHART_CHECKS} checks</span>
          </div>
          <LineChart
            points={freeAppLast10}
            unit="GB"
            height={150}
            seriesName={`${sid} app server free memory`}
          />
        </div>

        {hasDb ? (
          <div className="card card-pad">
            <div className="chart-head">
              <span className="chart-title">Free memory — database ({sid})</span>
              <span className="chart-sub">GB free, last {MEMORY_CHART_CHECKS} checks</span>
            </div>
            <LineChart
              points={freeDbLast10}
              unit="GB"
              height={150}
              seriesName={`${sid} database free memory`}
            />
          </div>
        ) : (
          <div className="card card-pad">
            <div className="chart-head">
              <span className="chart-title">Free memory — database ({sid})</span>
            </div>
            <p className="chart-empty">
              Database memory is not monitored for {sid} — the workbook records N/A.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
