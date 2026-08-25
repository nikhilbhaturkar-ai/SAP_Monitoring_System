// Domain rules shared by the ETL importer and the API.
// Ported from the original single-file dashboard prototype so that parsing and
// anomaly detection stay identical to what the Basis team already reviews.

/**
 * Cell values arrive in several free-text shapes:
 *   "224.75 GB /2.91 TB"            → used / total
 *   "Total: 107GB / Free: 43 GB"    → total / free
 *   "Total : 62 GB  / Free : 24 GB" → total / free
 * Two size tokens are always present; the "Free" keyword tells us which order.
 */
export function parseVolume(str) {
  if (!str) return null;
  const matches = [...String(str).matchAll(/([\d.]+)\s*(GB|TB)/gi)];
  if (matches.length < 2) return null;

  const toGB = (num, unit) => (unit.toUpperCase() === 'TB' ? num * 1024 : num);
  const a = toGB(parseFloat(matches[0][1]), matches[0][2]);
  const b = toGB(parseFloat(matches[1][1]), matches[1][2]);

  const isFreeFormat = /free/i.test(str);
  const totalGB = isFreeFormat ? a : b;
  const usedGB = isFreeFormat ? a - b : a;
  if (!totalGB) return null;

  return {
    usedGB: round2(usedGB),
    totalGB: round2(totalGB),
    freeGB: round2(totalGB - usedGB),
    percentUsed: (usedGB / totalGB) * 100,
  };
}

export function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

/**
 * A check is anomalous when its value stops matching the known-good reading.
 *
 * Two rules, chosen by what `normal_text` looks like — still one seed column,
 * still an UPDATE to retune, no per-check branching:
 *   - `normal_text` is purely numeric (e.g. "0"): the check reports a count, so
 *     "healthy" means the value equals that number. Used by st22, whose raw
 *     value is now just the dump count rather than a sentence.
 *   - anything else: the original substring test — the value must still
 *     contain the known-good phrase (e.g. "backup successful").
 */
export function isAnomaly(check, value) {
  if (!check || check.is_info || !check.normal_text) return false;
  if (value == null || String(value).trim() === '') return false;

  const normalText = String(check.normal_text).trim();
  if (/^\d+$/.test(normalText)) {
    const reading = Number(String(value).trim());
    return !Number.isFinite(reading) || reading !== Number(normalText);
  }

  return !String(value).toLowerCase().includes(normalText.toLowerCase());
}

export function formatGB(gb) {
  if (gb == null) return '—';
  return gb >= 1024 ? `${round2(gb / 1024)} TB` : `${round2(gb)} GB`;
}

export const THRESHOLDS = { critical: 95, elevated: 80 };

export function volumeSeverity(percentUsed) {
  if (percentUsed == null) return { level: 'unknown', label: 'No data' };
  if (percentUsed > THRESHOLDS.critical) return { level: 'critical', label: 'Critical' };
  if (percentUsed > THRESHOLDS.elevated) return { level: 'elevated', label: 'Elevated' };
  return { level: 'normal', label: 'Normal' };
}

/**
 * Build the UI-facing shape for one volume metric (used/total/free + severity).
 * `raw` is the original cell text so the dashboard can still show it verbatim.
 */
export function volumeInfo({ raw, used_gb, total_gb, free_gb }, dateLabel) {
  if (used_gb == null || total_gb == null) {
    return {
      text: raw || '—',
      raw: raw || null,
      percentUsed: null,
      pctLabel: '—',
      level: 'unknown',
      statusLabel: 'No data',
      detailNote: 'No data available for this metric.',
      usedGB: null,
      totalGB: null,
      freeGB: null,
      usedText: '—',
      totalText: '—',
      freeText: '—',
    };
  }

  const percentUsed = (used_gb / total_gb) * 100;
  const pct = Math.round(percentUsed);
  const severity = volumeSeverity(percentUsed);

  return {
    text: `${formatGB(used_gb)} / ${formatGB(total_gb)}`,
    raw: raw || null,
    percentUsed,
    pctLabel: `${pct}%`,
    level: severity.level,
    statusLabel: severity.label,
    detailNote: `${severity.label} — ${pct}% consumed as of ${dateLabel}`,
    usedGB: used_gb,
    totalGB: total_gb,
    freeGB: free_gb ?? round2(total_gb - used_gb),
    usedText: formatGB(used_gb),
    totalText: formatGB(total_gb),
    freeText: formatGB(free_gb ?? total_gb - used_gb),
  };
}

export function formatDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateShort(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}
