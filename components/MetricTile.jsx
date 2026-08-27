import { statusOf } from '../lib/status.js';
import { MiniDonut } from './MiniDonut.jsx';

/**
 * One parameter, one tile.
 *
 * The coloured bar down the left edge is decoration: the glyph and the word in
 * the footer are what actually carry the state, so the tile stays readable
 * without relying on hue.
 */
export function MetricTile({ tile, onOpenDetail }) {
  const meta = statusOf(tile.status);
  const percent = tile.meter ? Math.min(100, Math.max(0, tile.meter.percent ?? 0)) : null;
  const canOpen = Boolean(tile.detail) && typeof onOpenDetail === 'function';

  return (
    <article className="mtile" style={{ '--tile-accent': meta.color }}>
      <header className="mtile-head">
        <h3 className="mtile-title">{tile.label}</h3>
        {tile.hint && (
          <span className="mtile-info" tabIndex={0} role="note" aria-label={tile.hint} title={tile.hint}>
            i
          </span>
        )}
      </header>

      <div className="mtile-body">
        {tile.statusIcon ? (
          /*
           * Backup: pass/fail, so the reading is the icon itself rather than
           * a sentence — colour + glyph + the status word already in the
           * footer, same convention as everywhere else, just scaled up to be
           * the tile's headline instead of a small badge.
           */
          <button
            type="button"
            className="mtile-status-icon-btn"
            onClick={() => canOpen && onOpenDetail(tile)}
            disabled={!canOpen}
            aria-haspopup={canOpen ? 'dialog' : undefined}
            title={canOpen ? `Show details for ${tile.label}` : tile.value}
          >
            <span
              className="mtile-status-icon"
              style={{ background: statusOf(tile.statusIcon.ok ? 'ok' : 'critical').color }}
              aria-hidden="true"
            >
              {statusOf(tile.statusIcon.ok ? 'ok' : 'critical').glyph}
            </span>
            <span className="visually-hidden">{tile.value}</span>
          </button>
        ) : tile.osStatus ? (
          /*
           * OS Monitoring: one headline reading (centered, large) plus the
           * three checks behind it, each its own colour + glyph + label so
           * "which one failed" reads at a glance without opening the dialog.
           * The whole block is the same open-detail control as the plain
           * value button below — glyphs alone would not say that, so it
           * keeps the tile's existing underline-on-value affordance instead
           * of inventing a new one.
           */
          <button
            type="button"
            className="mtile-os"
            onClick={() => canOpen && onOpenDetail(tile)}
            disabled={!canOpen}
            aria-haspopup={canOpen ? 'dialog' : undefined}
            title={canOpen ? `Show details for ${tile.label}` : undefined}
          >
            <span className={`mtile-value mtile-value-${tile.scale} mtile-os-value`}>
              {tile.value}
            </span>
            <span className="mtile-os-checks">
              {tile.osStatus.subChecks.map((check) => {
                const checkMeta = statusOf(check.ok ? 'ok' : 'critical');
                return (
                  <span key={check.key} className="mtile-os-check">
                    <span
                      className="status-glyph"
                      style={{ background: checkMeta.color }}
                      aria-hidden="true"
                    >
                      {checkMeta.glyph}
                    </span>
                    {check.label}
                  </span>
                );
              })}
            </span>
          </button>
        ) : tile.pie ? (
          /* Ring beside the reading: the picture and the number share one row. */
          <div className="mtile-figure">
            <MiniDonut
              percent={tile.pie.percent}
              color={meta.color}
              label={`${tile.label} — ${tile.pie.label}`}
            />
            <div className="mtile-figure-text">
              <p className={`mtile-value mtile-value-${tile.scale}`}>
                {tile.value}
                {tile.unit && <span className="mtile-unit">{tile.unit}</span>}
              </p>
              <p className="mtile-figure-sub">{tile.pie.caption}</p>
            </div>
          </div>
        ) : canOpen ? (
          /*
           * A flagged reading is the one thing on a tile worth drilling into, so
           * the value itself is the control - a button, not a link, because it
           * opens a dialog rather than navigating anywhere.
           */
          <button
            type="button"
            className="mtile-value-button"
            onClick={() => onOpenDetail(tile)}
            aria-haspopup="dialog"
            title={`Show details for ${tile.label}`}
          >
            {tile.linkPrefix ? (
              /*
               * Count-phrase reading ("4 errors found"): the whole tile is
               * still the click target (title + aria-haspopup above cover
               * that), but only the number is underlined — the surrounding
               * words are grammar, not the thing being drilled into.
               */
              <span className={`mtile-value mtile-value-${tile.scale}`}>
                <span className="mtile-value-link-inline">{tile.linkPrefix}</span>
                {tile.value.slice(tile.linkPrefix.length)}
              </span>
            ) : (
              <span className={`mtile-value mtile-value-${tile.scale} mtile-value-link`}>
                {tile.value}
                {tile.unit && <span className="mtile-unit">{tile.unit}</span>}
              </span>
            )}
            <span className="visually-hidden"> - show details</span>
          </button>
        ) : (
          <p className={`mtile-value mtile-value-${tile.scale}`}>
            {tile.value}
            {tile.unit && <span className="mtile-unit">{tile.unit}</span>}
          </p>
        )}

        {tile.meter && (
          <div
            className="mtile-meter"
            role="meter"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${tile.label} — ${tile.meter.label}`}
          >
            <div
              className="mtile-meter-fill"
              style={{ width: `${Math.max(2, percent)}%`, background: meta.color }}
            />
          </div>
        )}
      </div>

      <footer className="mtile-foot">
        <span className="mtile-state">
          <span className="status-glyph" style={{ background: meta.color }} aria-hidden="true">
            {meta.glyph}
          </span>
          {tile.statusLabel}
        </span>
        {tile.note && <span className="mtile-note">{tile.note}</span>}
        {tile.sourceNote && (
          /* A tinted badge would only repeat the accent bar's colour; the
             words are what tell an Excel reading from a live one, so this
             carries no colour of its own. */
          <span className="mtile-source-note" title={tile.sourceNote}>
            {tile.sourceNote}
          </span>
        )}
      </footer>
    </article>
  );
}
