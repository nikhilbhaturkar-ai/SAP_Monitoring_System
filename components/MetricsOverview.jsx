'use client';

import { useCallback, useState } from 'react';
import { MetricTile } from './MetricTile.jsx';
import { MetricDetailDialog } from './MetricDetailDialog.jsx';
import { MetricsListView } from './MetricsListView.jsx';
import { paramTile, volumeTile, endpointTile } from '../lib/tiles.js';

/**
 * Static placeholder tiles for BI/Fiori/Web Dispatcher reachability — no
 * collector wired up for these yet (see lib/server/sap/mappers.js urlStatus
 * TODO), so the value is fixed rather than read from the dashboard payload.
 * Same single-icon "check" presentation as OS Monitoring's Memory/Swap/CPU
 * sub-checks (status-glyph circle + label), just scaled up to be the tile's
 * own headline via MetricTile's statusIcon path.
 */
const STATIC_REACHABILITY_TILES = [
  { key: 'static-bi', label: 'BI Reachable' },
  { key: 'static-fiori', label: 'Fiori Reachable' },
  { key: 'static-webdisp', label: 'WEBDISPATCHER Reachable' },
].map((t) => ({
  ...t,
  status: 'ok',
  statusLabel: 'Normal',
  value: 'Reachable',
  unit: null,
  note: null,
  hint: 'Static placeholder — not yet wired to a live reachability check.',
  scale: 'md',
  meter: null,
  pie: null,
  detail: null,
  statusIcon: { ok: true },
}));

const FAVORITES_STORAGE_KEY = 'sap_dashboard_favorites';

function matchesFilter(tile, priorityFilter) {
  if (!priorityFilter || priorityFilter === 'all') return true;

  const status = String(tile.status || '').toLowerCase();
  const severity = String(tile.severity || '').toLowerCase();

  if (priorityFilter === 'critical') {
    return status === 'critical' || severity === 'critical';
  }
  if (priorityFilter === 'warning') {
    return (
      status === 'warning' ||
      status === 'serious' ||
      status === 'info' ||
      severity === 'warning' ||
      severity === 'serious'
    );
  }
  if (priorityFilter === 'good') {
    return (
      status === 'ok' ||
      status === 'healthy' ||
      status === 'good' ||
      (status !== 'critical' && status !== 'warning' && status !== 'serious')
    );
  }
  return true;
}

export function MetricsOverview({ card, endpoints, runLabel, priorityFilter = 'all', layoutMode = 'tiles' }) {
  const [openTile, setOpenTile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load favorites from localStorage', e);
      }
    }
    return ['hana-data-volume', 'st22'];
  });

  // Stable identity: the dialog's effect depends on it, and a new function each
  // render would tear the modal down and reopen it on every parent render.
  const closeDialog = useCallback(() => setOpenTile(null), []);

  const toggleFavorite = useCallback((tileKey) => {
    setFavorites((prev) => {
      const exists = prev.includes(tileKey);
      const next = exists ? prev.filter((k) => k !== tileKey) : [...prev, tileKey];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save favorites to localStorage', e);
      }
      return next;
    });
  }, []);

  const allTiles = [
    ...endpoints.map(endpointTile),
    ...[card.dataVol, card.logVol, card.freeApp, card.freeDb].map((m) =>
      volumeTile(m, { pie: true })
    ),
    ...card.params.map(paramTile),
    ...STATIC_REACHABILITY_TILES,
  ];

  const tileMap = new Map(allTiles.map((t) => [t.key, t]));

  const favoriteTiles = favorites
    .map((key) => tileMap.get(key))
    .filter(Boolean)
    .filter((tile) => matchesFilter(tile, priorityFilter));

  const tiles = allTiles.filter((tile) => matchesFilter(tile, priorityFilter));

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const key = e.dataTransfer.getData('text/plain');
    if (key && tileMap.has(key) && !favorites.includes(key)) {
      toggleFavorite(key);
    }
  };

  return (
    <section className="mgroup" aria-label={`Monitored parameters for ${card.sid}`}>
      {layoutMode === 'list' ? (
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
            className={`favorites-section${isDragOver ? ' is-drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="favorites-header">
              <div className="favorites-title-wrap">
                <svg
                  className="favorites-star-icon"
                  viewBox="0 0 24 24"
                  fill="#f59e0b"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
                <h2 className="favorites-title">Favorites</h2>
                <span className="favorites-badge">{favoriteTiles.length}</span>
              </div>
              <span className="favorites-hint">
                Drag & drop tiles here or click ★ on any tile to pin
              </span>
            </div>

            {favoriteTiles.length === 0 ? (
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
            )}
          </div>

          <div className="all-metrics-divider">
            <h3 className="all-metrics-title">All Metrics</h3>
          </div>

          {tiles.length === 0 ? (
            <div className="card state-panel" style={{ padding: '36px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
                <strong>No metric tiles match the "{priorityFilter.toUpperCase()}" priority filter.</strong>
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                Select another priority filter or switch to <em>All Priorities</em> to view all metrics.
              </p>
            </div>
          ) : (
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
          )}
        </>
      )}

      {openTile && (
        <MetricDetailDialog
          // Remounting per tile lets the dialog open from scratch each time
          // rather than carrying the previous check's scroll position.
          key={openTile.key}
          tile={openTile}
          sid={card.sid}
          systemName={card.name}
          runLabel={runLabel}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}
