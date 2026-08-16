// Status is always rendered as colour + glyph + label, never colour alone.
export const STATUS = {
  good: { color: 'var(--status-good)', glyph: '✓', label: 'Healthy' },
  ok: { color: 'var(--status-good)', glyph: '✓', label: 'Normal' },
  healthy: { color: 'var(--status-good)', glyph: '✓', label: 'Healthy' },
  normal: { color: 'var(--status-good)', glyph: '✓', label: 'Normal' },
  warning: { color: 'var(--status-warning)', glyph: '!', label: 'Attention' },
  elevated: { color: 'var(--status-serious)', glyph: '▲', label: 'Elevated' },
  serious: { color: 'var(--status-serious)', glyph: '▲', label: 'Elevated' },
  critical: { color: 'var(--status-critical)', glyph: '✕', label: 'Critical' },
  info: { color: 'var(--text-muted)', glyph: '·', label: 'Info' },
  unknown: { color: 'var(--status-unknown)', glyph: '?', label: 'No data' },
};

export function statusOf(key) {
  return STATUS[key] ?? STATUS.unknown;
}

export function formatGB(value) {
  if (value == null) return '—';
  return value >= 1024
    ? `${Math.round((value / 1024) * 100) / 100} TB`
    : `${Math.round(value * 100) / 100} GB`;
}
