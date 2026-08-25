/*
 * Tile-sized part-to-whole ring: consumed space against the volume's capacity.
 *
 * Hand-built SVG like every other chart here. At tile scale a slice angle is not
 * measurable, so the hole carries the percentage as text and the ring only has to
 * say "roughly this much" — and the tile's footer still states used, total and
 * free in words, so nothing is readable only from the picture.
 *
 * Fill over track, not two slices: this is one measure against its limit, so the
 * remainder is the same hue washed back (the meter's contract) rather than a
 * second category competing for identity.
 */

const TRACK_OPACITY = 0.16;

export function MiniDonut({ percent, color, label, size = 62, thickness = 9 }) {
  const pct = Math.min(100, Math.max(0, percent ?? 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // A hair of the arc is always drawn, so a near-zero reading still shows a mark.
  const arc = Math.max(circumference * 0.012, (pct / 100) * circumference);

  return (
    <svg
      className="mini-donut"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={TRACK_OPACITY}
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${arc.toFixed(2)} ${(circumference - arc).toFixed(2)}`}
        />
      </g>
      <text
        x={size / 2}
        y={size / 2 + 4}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="var(--text-primary)"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}
