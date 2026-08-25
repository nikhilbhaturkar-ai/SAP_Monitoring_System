/** Shared helpers for API route handlers. Mirrors server/src/routes/api.js. */
export function windowDaysFrom(searchParams, fallback = 20) {
  const raw = Number(searchParams.get('window'));
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 1), 365);
}
