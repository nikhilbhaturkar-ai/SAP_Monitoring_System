'use client';

import { useCallback, useState } from 'react';
import { MetricTile } from './MetricTile.jsx';
import { MetricDetailDialog } from './MetricDetailDialog.jsx';
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

export function MetricsOverview({ card, endpoints, runLabel, priorityFilter = 'all' }) {
  const [openTile, setOpenTile] = useState(null);
  // Stable identity: the dialog's effect depends on it, and a new function each
  // render would tear the modal down and reopen it on every parent render.
  const closeDialog = useCallback(() => setOpenTile(null), []);

  const allTiles = [
    ...endpoints.map(endpointTile),
    ...[card.dataVol, card.logVol, card.freeApp, card.freeDb].map((m) =>
      volumeTile(m, { pie: true })
    ),
    ...card.params.map(paramTile),
    ...STATIC_REACHABILITY_TILES,
  ];

  const tiles = allTiles.filter((tile) => {
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
  });

  return (
    <section className="mgroup" aria-label={`Monitored parameters for ${card.sid}`}>
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
            <MetricTile key={tile.key} tile={tile} onOpenDetail={setOpenTile} />
          ))}
        </div>
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
