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

export function SystemMonitoring({ card, runLabel, layoutMode = 'tiles' }) {
  const [openTile, setOpenTile] = useState(null);
  const closeDialog = useCallback(() => setOpenTile(null), []);

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
  const favoriteTiles = favorites.map((k) => tileMap.get(k)).filter(Boolean);

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
      ) : layoutMode === 'list' ? (
        <MetricsListView
          tiles={tiles}
          favoriteTiles={favoriteTiles}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onOpenDetail={setOpenTile}
        />
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
