'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IDocDetailDialog } from './IDocDetailDialog.jsx';
import { MetricTile } from './MetricTile.jsx';
import { MetricsListView } from './MetricsListView.jsx';

// ── tile status helpers ────────────────────────────────────────────────────────

// Error / stuck counts: 0 = healthy, any positive = critical
const ERROR_KEYS = new Set([
  'Inbound IDoc Errors',
  'Outbound IDoc Errors',
  'Stuck Inbound IDocs',
  'Stuck Outbound IDocs',
]);

// Success rates are percentages (0–100). ≥95 ok, ≥80 warning, <80 critical
const RATE_KEYS = new Set([
  'Inbound IDoc Success Rate',
  'Outbound IDoc Success Rate',
]);

// Informational counts / latency — never flagged as an error
const INFO_KEYS = new Set([
  'Inbound IDoc Volume',
  'Outbound IDoc Volume',
  'Total IDoc activity',
  'Average Latency Inbound IDocs',
  'Average Latency Outbound IDocs',
]);

function tileStatus(kpiName, value) {
  if (ERROR_KEYS.has(kpiName)) {
    return value === 0 ? 'ok' : 'critical';
  }
  if (RATE_KEYS.has(kpiName)) {
    if (value >= 95) return 'ok';
    if (value >= 80) return 'warning';
    return 'critical';
  }
  return 'info'; // volume / latency
}

function tileStatusLabel(kpiName, value) {
  const s = tileStatus(kpiName, value);
  if (s === 'ok') return 'Normal';
  if (s === 'critical') return 'Critical';
  if (s === 'warning') return 'Warning';
  return 'Informational';
}

function tileValue(kpiName, value) {
  if (RATE_KEYS.has(kpiName)) return `${value}%`;
  if (kpiName.includes('Latency')) return value === 0 ? '0 s' : `${value} s`;
  return String(value);
}

function tileHint(kpiName, value) {
  if (ERROR_KEYS.has(kpiName))
    return value === 0
      ? `No ${kpiName.toLowerCase()} detected.`
      : `${value} ${kpiName.toLowerCase()} detected — investigate in SAP WE05.`;
  if (RATE_KEYS.has(kpiName))
    return `${value}% of IDocs processed successfully. Target ≥ 95%.`;
  if (kpiName.includes('Latency'))
    return `Average processing latency: ${value} second${value === 1 ? '' : 's'}.`;
  return `Total count: ${value}`;
}

function buildTile(kpi) {
  const { KPI_NAME, KPI_VALUE } = kpi;
  const status = tileStatus(KPI_NAME, KPI_VALUE);
  const value = tileValue(KPI_NAME, KPI_VALUE);
  const valueLen = value.length;
  const scale = valueLen <= 4 ? 'lg' : valueLen <= 10 ? 'md' : 'sm';

  return {
    key: KPI_NAME.replace(/\s+/g, '_').toLowerCase(),
    label: KPI_NAME,
    status,
    statusLabel: tileStatusLabel(KPI_NAME, KPI_VALUE),
    value,
    unit: null,
    note: null,
    hint: tileHint(KPI_NAME, KPI_VALUE),
    scale,
    meter: null,
    pie: null,
    detail: {},
    sourceNote: null,
    // Carry the raw IDOC_DETAILS and IDOC_VOLUME for future drill-down use
    idocDetails: kpi.IDOC_DETAILS ?? [],
    idocVolume: kpi.IDOC_VOLUME ?? [],
  };
}

const FAVORITES_KEY = 'sap_idoc_monitoring_favorites';

// ── component ──────────────────────────────────────────────────────────────────

export function IDocMonitoring({ sid, layoutMode = 'tiles' }) {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openTile, setOpenTile] = useState(null);
  const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  });

  const toggleFavorite = useCallback((key) => {
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e, tileMap) => {
    e.preventDefault();
    setIsDragOver(false);
    const key = e.dataTransfer.getData('text/plain');
    if (key && tileMap.has(key) && !favorites.includes(key)) toggleFavorite(key);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/idoc/${encodeURIComponent(sid)}`)
      .then((r) => {
        if (!r.ok) return r.json().then((b) => Promise.reject(new Error(b?.error ?? `HTTP ${r.status}`)));
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setKpis(Array.isArray(data) ? data : null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sid]);

  const tiles = kpis ? kpis.map(buildTile) : [];
  const tileMap = new Map(tiles.map((t) => [t.key, t]));
  const favoriteTiles = favorites.map((k) => tileMap.get(k)).filter(Boolean);

  return (
    <section className="mgroup" aria-label={`IDoc monitoring for ${sid}`}>
      <div className="all-metrics-divider">
        <h3 className="all-metrics-title">IDoc Monitoring</h3>
      </div>

      {loading ? (
        <div className="card state-panel" style={{ padding: '36px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-muted)' }}>
            Loading IDoc monitoring data…
          </p>
        </div>
      ) : error ? (
        <div className="card state-panel" style={{ padding: '36px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
            <strong>Could not load IDoc data</strong>
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            {error}
          </p>
        </div>
      ) : tiles.length === 0 ? (
        <div className="card state-panel" style={{ padding: '36px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
            <strong>No IDoc data returned by the SAP service.</strong>
          </p>
        </div>
      ) : layoutMode === 'list' ? (
        <MetricsListView
          tiles={tiles}
          favoriteTiles={favoriteTiles}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onOpenDetail={setOpenTile}
        />
      ) : (
        <>
          {/* ── FAVORITES SECTION ── */}
          <div
            className={`favorites-section${isDragOver ? ' is-drag-over' : ''}${isFavoritesCollapsed ? ' is-collapsed' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, tileMap)}
          >
            <div className="favorites-header">
              <div className="favorites-title-wrap">
                <svg className="favorites-star-icon" viewBox="0 0 24 24" fill="#f59e0b" width="20" height="20" aria-hidden="true">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
                <h2 className="favorites-title">Favorites</h2>
                <span className="favorites-badge">{favoriteTiles.length}</span>
              </div>
              <div className="favorites-header-actions">
                <span className="favorites-hint">Drag &amp; drop tiles here or click ★ on any tile to pin</span>
                <button
                  type="button"
                  className="favorites-toggle-btn"
                  onClick={() => setIsFavoritesCollapsed((prev) => !prev)}
                  title={isFavoritesCollapsed ? 'Expand Favorites' : 'Collapse Favorites'}
                  aria-label={isFavoritesCollapsed ? 'Expand Favorites' : 'Collapse Favorites'}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isFavoritesCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span>{isFavoritesCollapsed ? 'Expand' : 'Collapse'}</span>
                </button>
              </div>
            </div>

            {!isFavoritesCollapsed && (
              favoriteTiles.length === 0 ? (
                <div className="favorites-empty-zone">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                  <span className="favorites-empty-text">
                    No favorite tiles. <strong>Drag any tile here</strong> or click the <strong>★ icon</strong> on a tile to add it to Favorites.
                  </span>
                </div>
              ) : (
                <div className="mtile-grid favorites-grid">
                  {favoriteTiles.map((tile) => (
                    <MetricTile
                      key={`fav-${tile.key}`}
                      tile={tile}
                      isFavorite={true}
                      onToggleFavorite={toggleFavorite}
                      onOpenDetail={setOpenTile}
                    />
                  ))}
                </div>
              )
            )}
          </div>

          {/* ── ALL TILES ── */}
          <div className="mtile-grid">
            {tiles.map((tile) => (
              <MetricTile
                key={tile.key}
                tile={tile}
                isFavorite={favorites.includes(tile.key)}
                onToggleFavorite={toggleFavorite}
                onOpenDetail={setOpenTile}
              />
            ))}
          </div>
        </>
      )}
      {openTile && (
        <IDocDetailDialog
          key={openTile.key}
          tile={openTile}
          sid={sid}
          onClose={() => setOpenTile(null)}
        />
      )}
    </section>
  );
}
