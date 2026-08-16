import { statusOf } from '../lib/status.js';

/**
 * Colour + glyph + text. The glyph is what makes the state readable without
 * relying on hue, so it is never optional.
 */
export function StatusChip({ status, label, className = '' }) {
  const meta = statusOf(status);
  return (
    <span className={`status status-text-${status} ${className}`}>
      <span className="status-glyph" style={{ background: meta.color }} aria-hidden="true">
        {meta.glyph}
      </span>
      <span>{label ?? meta.label}</span>
    </span>
  );
}

/** Compact variant for dense rows — glyph only, with the label read by AT. */
export function StatusDot({ status, srLabel }) {
  const meta = statusOf(status);
  return (
    <>
      <span className="status-glyph" style={{ background: meta.color }} aria-hidden="true">
        {meta.glyph}
      </span>
      <span className="visually-hidden">{srLabel ?? meta.label}: </span>
    </>
  );
}
