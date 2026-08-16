import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const PAD = { top: 14, right: 56, bottom: 24, left: 46 };

/** Round tick values to clean numbers covering [min, max]. */
function niceTicks(min, max, count = 3) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const rawStep = (max - min) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step / 2; v += step) {
    if (v >= min - step / 2) ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

function formatTick(value) {
  return Number.isInteger(value) ? value.toLocaleString('en-GB') : value.toFixed(1);
}

/**
 * Single-series time line. A single series needs no legend — the title names it.
 * Ships the hover layer by default: a crosshair snaps to the nearest run date and
 * one tooltip reads out that date's value. Everything the tooltip shows is also
 * reachable through the end label and the table view.
 */
export function LineChart({
  points,
  height = 140,
  unit = 'GB',
  seriesName,
  valueKey = 'value',
  emptyMessage = 'No data for this metric.',
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(560);
  const [activeIndex, setActiveIndex] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const tableId = useRef(`chart-table-${Math.random().toString(36).slice(2, 9)}`);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width;
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const series = useMemo(
    () =>
      (points ?? []).map((p, i) => ({
        index: i,
        label: p.dateShort ?? p.date ?? String(i),
        value: p[valueKey] ?? null,
        carriedForward: Boolean(p.carriedForward),
      })),
    [points, valueKey]
  );

  const real = useMemo(() => series.filter((p) => p.value != null), [series]);

  const geometry = useMemo(() => {
    if (real.length === 0) return null;
    const values = real.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.15 || Math.max(1, Math.abs(max) * 0.05);
    const lo = min - pad;
    const hi = max + pad;
    const plotW = Math.max(40, width - PAD.left - PAD.right);
    const plotH = Math.max(30, height - PAD.top - PAD.bottom);
    const lastIndex = Math.max(1, series.length - 1);

    const x = (i) => PAD.left + (i / lastIndex) * plotW;
    const y = (v) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

    return { x, y, lo, hi, min, max, plotW, plotH, ticks: niceTicks(min, max) };
  }, [real, series.length, width, height]);

  const handlePointer = useCallback(
    (event) => {
      if (!geometry || series.length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const relX = event.clientX - rect.left;
      const ratio = (relX - PAD.left) / Math.max(1, geometry.plotW);
      const idx = Math.round(ratio * Math.max(1, series.length - 1));
      setActiveIndex(Math.min(series.length - 1, Math.max(0, idx)));
    },
    [geometry, series.length]
  );

  const handleKey = useCallback(
    (event) => {
      if (series.length === 0) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex((prev) => {
          const base = prev == null ? series.length - 1 : prev;
          const next = base + (event.key === 'ArrowRight' ? 1 : -1);
          return Math.min(series.length - 1, Math.max(0, next));
        });
      } else if (event.key === 'Escape') {
        setActiveIndex(null);
      }
    },
    [series.length]
  );

  useEffect(() => setActiveIndex(null), [points]);

  if (!geometry) {
    return <div className="chart-empty">{emptyMessage}</div>;
  }

  const path = real
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${geometry.x(p.index).toFixed(1)} ${geometry.y(p.value).toFixed(1)}`)
    .join(' ');

  const areaPath =
    real.length > 1
      ? `${path} L ${geometry.x(real[real.length - 1].index).toFixed(1)} ${(
          PAD.top + geometry.plotH
        ).toFixed(1)} L ${geometry.x(real[0].index).toFixed(1)} ${(PAD.top + geometry.plotH).toFixed(
          1
        )} Z`
      : null;

  const last = real[real.length - 1];
  const active = activeIndex != null ? series[activeIndex] : null;
  const activeValue = active && active.value != null ? active : null;

  // Keep the tooltip inside the card rather than letting it run off the edge.
  const tooltipX = activeValue
    ? Math.min(Math.max(geometry.x(activeValue.index) - 64, 0), Math.max(0, width - 140))
    : 0;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        className="chart-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${seriesName ?? 'Series'} over the last ${series.length} monitoring runs. ${
          last ? `Latest ${last.value} ${unit} on ${last.label}.` : ''
        }`}
        tabIndex={0}
        onPointerMove={handlePointer}
        onPointerLeave={() => setActiveIndex(null)}
        onKeyDown={handleKey}
        onBlur={() => setActiveIndex(null)}
      >
        {/* Recessive hairline gridlines carry the values that aren't directly labelled. */}
        {geometry.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={PAD.left + geometry.plotW}
              y1={geometry.y(tick)}
              y2={geometry.y(tick)}
              stroke="var(--gridline)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={geometry.y(tick) + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}

        <line
          x1={PAD.left}
          x2={PAD.left + geometry.plotW}
          y1={PAD.top + geometry.plotH}
          y2={PAD.top + geometry.plotH}
          stroke="var(--baseline)"
          strokeWidth="1"
        />

        {/* First and last run labels only — the tooltip carries the rest. */}
        <text x={PAD.left} y={height - 6} fontSize="10" fill="var(--text-muted)">
          {series[0]?.label}
        </text>
        <text
          x={PAD.left + geometry.plotW}
          y={height - 6}
          fontSize="10"
          textAnchor="end"
          fill="var(--text-muted)"
        >
          {series[series.length - 1]?.label}
        </text>

        {areaPath && <path d={areaPath} fill="var(--series-1-wash)" stroke="none" />}

        <path
          d={path}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {activeValue && (
          <g>
            <line
              x1={geometry.x(activeValue.index)}
              x2={geometry.x(activeValue.index)}
              y1={PAD.top}
              y2={PAD.top + geometry.plotH}
              stroke="var(--baseline)"
              strokeWidth="1"
            />
            <circle
              cx={geometry.x(activeValue.index)}
              cy={geometry.y(activeValue.value)}
              r="5"
              fill="var(--series-1)"
              stroke="var(--surface-1)"
              strokeWidth="2"
            />
          </g>
        )}

        {/* End marker with a surface ring, plus the one direct label. */}
        <circle
          cx={geometry.x(last.index)}
          cy={geometry.y(last.value)}
          r="4.5"
          fill="var(--series-1)"
          stroke="var(--surface-1)"
          strokeWidth="2"
        />
        <text
          x={geometry.x(last.index) + 10}
          y={geometry.y(last.value) + 4}
          fontSize="11.5"
          fontWeight="600"
          fill="var(--text-primary)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatTick(last.value)} {unit}
        </text>
      </svg>

      {activeValue && (
        <div className="tooltip" style={{ left: tooltipX, top: 4 }} role="status">
          <div className="tooltip-date">{activeValue.label}</div>
          <div className="tooltip-row">
            <span className="tooltip-key" style={{ background: 'var(--series-1)' }} />
            <span className="tooltip-value">
              {formatTick(activeValue.value)} {unit}
            </span>
          </div>
          {seriesName && <div className="tooltip-series">{seriesName}</div>}
          {activeValue.carriedForward && (
            <div className="tooltip-note">Carried forward — no new reading logged.</div>
          )}
        </div>
      )}

      <div className="chart-toolbar">
        <button
          type="button"
          className="link-button"
          aria-expanded={showTable}
          aria-controls={tableId.current}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? 'Hide data table' : 'View data table'}
        </button>
      </div>

      {showTable && (
        <div className="table-scroll" id={tableId.current}>
          <table className="data-table">
            <caption className="visually-hidden">
              {seriesName} by monitoring run
            </caption>
            <thead>
              <tr>
                <th scope="col">Run date</th>
                <th scope="col">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {series
                .slice()
                .reverse()
                .map((p) => (
                  <tr key={`${p.index}-${p.label}`}>
                    <td>{p.label}</td>
                    <td>{p.value == null ? '—' : formatTick(p.value)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
