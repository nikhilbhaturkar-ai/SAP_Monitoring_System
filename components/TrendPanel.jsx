import { LineChart } from './LineChart.jsx';

/**
 * Headroom trends. Free memory and consumed capacity are different measures, so
 * they get their own charts on their own axes — never two scales in one frame.
 */
export function TrendPanel({ trends, sid, windowDays }) {
  const hasDb = (trends.freeDb ?? []).some((p) => p.value != null);

  return (
    <section className="stack-gap" aria-labelledby="trends-heading">
      <h2 className="section-label" id="trends-heading">
        Memory headroom trend
      </h2>
      <div className="chart-grid">
        <div className="card card-pad">
          <div className="chart-head">
            <span className="chart-title">Free memory — app server ({sid})</span>
            <span className="chart-sub">GB free, last {windowDays} checks</span>
          </div>
          <LineChart
            points={trends.freeApp}
            unit="GB"
            height={150}
            seriesName={`${sid} app server free memory`}
          />
        </div>

        {hasDb ? (
          <div className="card card-pad">
            <div className="chart-head">
              <span className="chart-title">Free memory — database ({sid})</span>
              <span className="chart-sub">GB free, last {windowDays} checks</span>
            </div>
            <LineChart
              points={trends.freeDb}
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
