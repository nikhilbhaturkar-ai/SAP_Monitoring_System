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

/**
 * Every monitored parameter as its own tile, in one continuous five-across grid.
 *
 * The tiles are not split into headed sections: the groups are uneven (two
 * volumes, two memory readings, three endpoints), so headings would break the
 * grid into part-filled rows. Order still follows the checklist — endpoints,
 * DBA Cockpit volumes, free memory, then the daily transaction checks — and each
 * tile names its own parameter.
 *
 * Tiles for flagged checks open a detail dialog. Which tiles those are is
 * decided by the data (the API attaches `detail` to anomalies), never by a list
 * of check keys here.
 */
export function MetricsOverview({ card, endpoints, runLabel }) {
  const [openTile, setOpenTile] = useState(null);
  // Stable identity: the dialog's effect depends on it, and a new function each
  // render would tear the modal down and reopen it on every parent render.
  const closeDialog = useCallback(() => setOpenTile(null), []);

  const tiles = [
    ...endpoints.map(endpointTile),
    ...STATIC_REACHABILITY_TILES,
    // Every capacity reading gets the ring: they are the same measure (consumed
    // against a limit), so they must be encoded the same way to stay comparable.
    ...[card.dataVol, card.logVol, card.freeApp, card.freeDb].map((m) =>
      volumeTile(m, { pie: true })
    ),
    ...card.params.map(paramTile),
  ];

  return (
    <section className="mgroup" aria-label={`Monitored parameters for ${card.sid}`}>
      <div className="mtile-grid">
        {tiles.map((tile) => (
          <MetricTile key={tile.key} tile={tile} onOpenDetail={setOpenTile} />
        ))}
      </div>

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
