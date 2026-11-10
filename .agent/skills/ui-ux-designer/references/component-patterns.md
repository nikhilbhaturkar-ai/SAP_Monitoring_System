# Component patterns

Working code, lifted from the SAP Monitoring System, that shows the house
patterns in practice. Read the relevant section when you're building the
equivalent piece in a new project — adapt the markup/props to the new
domain, but keep the underlying structure, because it's what makes the
accessibility and consistency rules actually hold instead of being
aspirational.

## Status: color + glyph + label, never color alone

`lib/status.js` is the single source of truth for what each severity means —
one object per status, each with a color, a glyph, and a label:

```js
export const STATUS = {
  good:     { color: 'var(--status-good)',     glyph: '✓', label: 'Healthy' },
  warning:  { color: 'var(--status-warning)',  glyph: '!', label: 'Attention' },
  serious:  { color: 'var(--status-serious)',  glyph: '▲', label: 'Elevated' },
  critical: { color: 'var(--status-critical)', glyph: '✕', label: 'Critical' },
  unknown:  { color: 'var(--status-unknown)',  glyph: '?', label: 'No data' },
};

export function statusOf(key) {
  return STATUS[key] ?? STATUS.unknown;
}
```

For a new project, re-derive the severity names from that domain's own
vocabulary (e.g. `onTrack` / `atRisk` / `blocked` for a project tracker,
`inStock` / `low` / `outOfStock` for inventory) but keep the shape — a
color, a glyph, a label, one lookup function — so every place that renders
status pulls from the same table instead of re-deciding what "red" means.

Two rendering variants cover almost every use:

```jsx
// Full chip — used wherever there's room for a label (table cells, tiles).
function StatusChip({ status, label }) {
  const meta = statusOf(status);
  return (
    <span className={`status status-text-${status}`}>
      <span className="status-glyph" style={{ background: meta.color }} aria-hidden="true">
        {meta.glyph}
      </span>
      <span>{label ?? meta.label}</span>
    </span>
  );
}

// Compact dot — dense rows/lists where a label would wrap; the label still
// exists for assistive tech, just visually hidden instead of dropped.
function StatusDot({ status, srLabel }) {
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
```

The rule this encodes: a colorblind user, a screen-reader user, and a
grayscale printout must all be able to tell statuses apart. If you catch
yourself writing `style={{ color: meta.color }}` on text with nothing else
distinguishing it, that's the violation to fix — pair it with the glyph.

## Cards: header / body / footer, decoration separated from meaning

`components/MetricTile.jsx` is the canonical "one parameter, one tile" card.
Its anatomy, generalized:

- **A colored accent bar** down one edge — pure decoration, set via a CSS
  custom property (`style={{ '--tile-accent': meta.color }}`) so it tints
  with the status but carries zero information on its own (someone
  colorblind loses nothing by not seeing it).
- **Header**: title + small icon-only actions (info tooltip, favorite
  toggle) — kept out of the tab order of the main content so arrow/tab
  navigation reaches the value first.
- **Body**: the headline reading. If the value opens more detail, the
  value itself is a `<button>` (not the whole card, not a link) — a button
  because it opens a dialog rather than navigating, and scoped to the value
  so the clickable area matches what's visually underlined.
- **Footer**: the status chip (color + glyph + label) plus an optional
  plain-text note. The note is deliberately uncolored — compare "Excel
  import" vs. a live reading: the *words* distinguish them, so no extra hue
  is spent on something the glyph system doesn't need.

```jsx
<article className="mtile" style={{ '--tile-accent': meta.color }}>
  <header className="mtile-head">
    <h3 className="mtile-title">{tile.label}</h3>
    {/* icon-only actions here */}
  </header>
  <div className="mtile-body">
    <button type="button" className="mtile-value-button" onClick={openDetail}
            aria-haspopup="dialog" title={`Show details for ${tile.label}`}>
      <span className="mtile-value">{tile.value}</span>
    </button>
  </div>
  <footer className="mtile-foot">
    <StatusChip status={tile.status} label={tile.statusLabel} />
    {tile.note && <span className="mtile-note">{tile.note}</span>}
  </footer>
</article>
```

A progress/meter bar, when a tile has one, is a plain `role="meter"` div
whose fill color comes from the *same* status lookup — never a separate
"progress color" — so the bar and the glyph never disagree.

## Charts: no library, hand-built inline SVG, always with a data-table fallback

This project deliberately has no chart library (`components/LineChart.jsx`,
`MiniDonut.jsx` are plain SVG). That's a defensible choice to carry into a
new project when the chart vocabulary is small and custom (sparkline-style
trends, a donut, a bar) — it keeps bundle size down and gives full control
over the accessibility fallback. If the new project needs many chart types
or heavy interactivity (zoom, brushing, tooltips with real data lookups),
reconsider and use a library instead; don't force the no-library constraint
past the point it's paying for itself.

Whichever way you build a chart, every one needs a **"View data table"**
disclosure next to it — the same numbers rendered as an actual `<table>` —
so a screen-reader user or someone who just wants to copy the numbers
isn't stuck squinting at an SVG.

## Layout shell

- `.shell`: a centered, width-capped container (`max-width: 1360px`) with
  generous padding, collapsing to 16–24px on narrow viewports. Reuse this
  for any dashboard-style app; for a content-heavy app (articles, docs) a
  narrower cap (720–840px) reads better.
- `.masthead`: a full-bleed header strip with a subtle gradient wash (a hint
  of the series accent color fading to transparent) bleeding past the
  shell's own padding via negative margins — gives the header some
  presence without needing a hard color block.
- `.tabs`: a pill-shaped segmented control (surface-1 background, 4px
  padding, each tab a flat button) for switching top-level views in place,
  as an alternative to a sidebar when there are only 2–4 sections.
