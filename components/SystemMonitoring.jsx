'use client';

import { useCallback, useState } from 'react';
import { MetricTile } from './MetricTile.jsx';
import { MetricDetailDialog } from './MetricDetailDialog.jsx';
import { MetricsListView } from './MetricsListView.jsx';
import { paramTile } from '../lib/tiles.js';

// The 10 security / user-management checks shown in this tab, in display order.
const SYSTEM_MONITORING_KEYS = [
  'locked',
  'inactive',
  'highPriv',
  'unassignedRoles',
  'ghostRoles',
  'unusedProfiles',
  'unusedTcodes',
  'undeletedUsers',
  'redundantRoles',
  'emptyShell',
];

const FAVORITES_STORAGE_KEY = 'sap_system_monitoring_favorites';

function matchesFilter(tile, priorityFilter) {
  if (!priorityFilter || priorityFilter === 'all') return true;
  const status = String(tile.status || '').toLowerCase();
  const severity = String(tile.severity || '').toLowerCase();
  if (priorityFilter === 'critical') return status === 'critical' || severity === 'critical';
  if (priorityFilter === 'warning') {
    return status === 'warning' || status === 'serious' || status === 'info' || status === 'elevated'
      || severity === 'warning' || severity === 'serious';
  }
  if (priorityFilter === 'good') return status === 'ok' || status === 'normal' || status === 'healthy' || status === 'good';
  return true;
}

export function SystemMonitoring({ card, runLabel, layoutMode = 'tiles', priorityFilter = 'all' }) {
  const [openTile, setOpenTile] = useState(null);
  const closeDialog = useCallback(() => setOpenTile(null), []);
  const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  });

  const toggleFavorite = useCallback((tileKey) => {
    setFavorites((prev) => {
      const next = prev.includes(tileKey)
        ? prev.filter((k) => k !== tileKey)
        : [...prev, tileKey];
      try { localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  // Pull only the 10 system-monitoring params from card.params, preserving order.
  const keyIndex = new Map(SYSTEM_MONITORING_KEYS.map((k, i) => [k, i]));
  const tiles = (card?.params ?? [])
    .filter((p) => keyIndex.has(p.key))
    .sort((a, b) => keyIndex.get(a.key) - keyIndex.get(b.key))
    .map(paramTile);

  const tileMap = new Map(tiles.map((t) => [t.key, t]));

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const key = e.dataTransfer.getData('text/plain');
    if (key && tileMap.has(key) && !favorites.includes(key)) toggleFavorite(key);
  };
  const filteredTiles = tiles.filter((t) => matchesFilter(t, priorityFilter));
  const favoriteTiles = favorites.map((k) => tileMap.get(k)).filter(Boolean).filter((t) => matchesFilter(t, priorityFilter));

  return (
    <section className="mgroup" aria-label={`System monitoring for ${card?.sid}`}>
      <div className="all-metrics-divider">
        <h3 className="all-metrics-title">System Monitoring</h3>
      </div>

      {tiles.length === 0 ? (
        <div className="card state-panel" style={{ padding: '36px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
            <strong>No system monitoring data available for this run.</strong>
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Data will appear here once the SAP collector is connected and returns user / role checks.
          </p>
        </div>
      ) : filteredTiles.length === 0 ? (
        <div className="card state-panel" style={{ padding: '36px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
            <strong>No metric tiles match the "{priorityFilter.toUpperCase()}" priority filter.</strong>
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Select another priority filter or switch to <em>All Priorities</em> to view all metrics.
          </p>
        </div>
      ) : layoutMode === 'list' ? (
        <MetricsListView
          tiles={filteredTiles}
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
            onDrop={handleDrop}
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
            {filteredTiles.map((tile) => (
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
        <MetricDetailDialog
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
