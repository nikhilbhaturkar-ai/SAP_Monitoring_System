---
name: ui-ux-designer
description: >-
  Apply the house visual design system — extracted from the SAP Monitoring
  System dashboard — to a new or existing project: warm-neutral design
  tokens with light/dark theming, a color+glyph+label status convention,
  card/tile anatomy, hand-built SVG charts with a data-table fallback, and
  a dashboard shell layout. Use this whenever asked to design, theme, or
  restyle a UI, dashboard, or component — build a new design system "like
  this one", pick colors/typography/spacing for a web app, design a status
  indicator or metric card, or make a new project visually consistent with
  this one — even if the user doesn't say "design system" or name this
  project explicitly.
metadata:
  model: sonnet
---

## Where this comes from

This is not a generic design-skill template. It's the actual visual
language of the SAP Monitoring System dashboard in this repo — the tokens
in [app/monitoring.css](../../../app/monitoring.css), the status convention
in [lib/status.js](../../../lib/status.js), and the card/chart components
under [components/](../../../components/) — written up so the same look and
the same reasoning can be carried into a different project without
re-deriving it from scratch each time.

Use `references/tokens.css` as the starting CSS variable file for a new
project and `references/component-patterns.md` for the component anatomy
(status chips, metric tiles, charts, layout shell) with working code to
adapt. Read those when you're actually building; this file is the why and
the checklist.

## The house style, in one paragraph

A warm off-white (not pure white/gray) neutral palette, generous card
radius and soft shadows, one accent hue reserved for data/highlights and a
*separate* fixed five-step severity ramp (good → warning → serious →
critical → unknown) reserved for status — the two never share colors. Every
status is color *plus* a glyph *plus* a word, never color alone. Charts are
hand-rolled SVG, not a library, each with a plain-table fallback. Dark mode
mirrors every token rather than being an afterthought.

## Applying it to a new project

1. **Start from the tokens, not a blank stylesheet.** Copy
   `references/tokens.css` in and re-tune the actual hex values to fit the
   new project's brand or domain — a finance app might want cooler blues, a
   consumer app warmer — but keep the *role names*
   (`--surface-1/2/3`, `--status-good/warning/serious/critical/unknown`,
   `--series-1`, `--radius-card`, `--shadow-card`). Components should
   reference the role, never a literal hex, so re-theming later is a
   one-file edit instead of a grep-and-replace across every component.

2. **Re-derive the status vocabulary for the new domain**, same shape as
   `lib/status.js`: a small object keyed by status name, each value a
   `{color, glyph, label}` triple, one lookup function. Don't reuse "good/
   warning/serious/critical" verbatim if the domain has its own words
   (a CI pipeline might want `passing/flaky/failing`; an order-tracking app
   `delivered/delayed/lost`) — but keep exactly the shape, because
   downstream components (`StatusChip`, meters, accent bars) all key off it.

3. **Build cards as header/body/footer**, with the status rendered in the
   footer as a chip and any colored accent treated as pure decoration layered
   on top of that, never a replacement for it. See
   `references/component-patterns.md` for the full `MetricTile` pattern
   including the "value as button, not whole-card link" rule.

4. **Keep charts custom only while the chart vocabulary stays small.** This
   project's no-library choice (plain SVG line charts and donuts) is a good
   default for a handful of simple, consistent chart shapes, but it's a
   tradeoff, not a dogma — if the new project needs many chart kinds or rich
   interaction, use a real charting library instead and keep only the
   accessibility rule: every chart ships with a "View data table" fallback,
   because an SVG with no backing table is invisible to assistive tech and
   impossible to copy numbers out of.

5. **Carry the layout shell** (`.shell` max-width container, `.masthead`
   gradient header, pill `.tabs` switcher) if the new project is
   dashboard-shaped. Don't force it onto something that isn't — a
   marketing page or a linear document doesn't want a capped-width "shell"
   with a tab bar.

6. **Theme dark mode from the start**, not as a retrofit: for every token
   added to the light `:root` block, add its dark counterpart in the same
   pass. A token with no dark-mode value is a bug waiting for someone to
   flip the OS theme.

## What never changes across projects

These are accessibility/consistency rules, not stylistic choices — keep
them even when everything else (colors, fonts, specific layout) is
re-themed for a new brand:

- **Status is never color alone.** Always color + glyph + text, because
  colorblind users, screen readers, and grayscale printouts all need to
  tell statuses apart without relying on hue.
- **Status colors and data-series colors are different, reserved pools.**
  If "critical red" can also show up as a chart line color, "that's
  critical" stops being a reliable reading.
- **Every chart has a data-table fallback.** No exceptions — a chart that
  can't be read as a table is a chart half the audience can't use.
- **Decoration (accent bars, gradient washes) never carries information by
  itself.** If removing a color would make the UI lie about state, that
  color wasn't decoration — move the information into text/glyph and let
  the color go back to being decoration.

## When you're asked to design something and *not* told to match this look

If the request is for a project with no stated connection to this one, this
skill still gives a sound default methodology (token-first theming,
reserved status colors, glyph+label, accessible chart fallbacks) — apply
the *reasoning*, but don't force this exact warm-neutral/IBM-Plex palette
onto a brief that calls for something else. Ask or infer the new project's
own brand cues first; the token *structure* travels, the specific colors
don't have to.
