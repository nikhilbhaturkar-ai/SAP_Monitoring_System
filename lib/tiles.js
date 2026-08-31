/*
 * Presentation-only shaping for the Metrics Overview grid.
 *
 * Nothing here renames, regroups or reinterprets a check: labels and recorded
 * readings pass through verbatim. The only transformation is a *display* split —
 * a reading that carries a count is shown as the number with the full sentence
 * kept underneath, so the tiles line up on a common headline the way the
 * reference layout does.
 */

const NUMERIC_RE = /\d[\d,]*(?:\.\d+)?/;

/**
 * A tile's reading is only ever from one of two places, and a viewer has no
 * way to tell them apart otherwise — same green checkmark either way. This
 * turns (source, hasLiveApi) into the sentence that goes under the reading
 * and into its hover hint. hasLiveApi (from config, not the reading itself)
 * is checked first: a system with no configured API can only ever show
 * imported data, no matter what an individual row's source column says.
 */
function sourceNote(source, hasLiveApi) {
  if (!hasLiveApi) return 'From the imported workbook — no live API configured for this system.';
  if (source === 'sap-api') return null; // the common case; no need to say it every tile
  if (source === 'excel') return 'From the imported workbook, not yet re-polled live.';
  return null;
}

/** "224.75 GB" → headline amount plus its unit, so the unit can be set smaller. */
function splitAmount(text) {
  if (!text || text === '—') return { value: text || '—', unit: null };
  const match = /^([\d.,]+)\s*(\S+)$/.exec(text.trim());
  return match ? { value: match[1], unit: match[2] } : { value: text.trim(), unit: null };
}

/**
 * Headline type size steps down as the reading gets longer, so tiles stay even.
 * The largest step is reserved for counts and amounts — a short phrase such as
 * "All Ok" is still a sentence, and set at 38px it shouts louder than the number
 * tiles beside it.
 */
export function valueScale(value, { numeric = false } = {}) {
  const length = String(value).length;
  if (numeric && length <= 6) return 'lg';
  if (length <= 16) return 'md';
  return 'sm';
}

const PARAM_STATE = { ok: 'Normal', info: 'Informational' };

/*
 * A handful of checks report a bare count (e.g. raw_value "4"). Read as a
 * number alone it's ambiguous — 4 what? These spell the count back out as
 * the sentence the checklist actually means, keyed by check.
 */
const COUNT_PHRASES = {
  st22: (n) => `${n} ${n === '1' ? 'error' : 'errors'} found`,
  sm12: (n) => `${n} ${n === '1' ? 'lock' : 'locks'} found`,
  smq1: (n) => `${n} outbound ${n === '1' ? 'queue' : 'queues'} found`,
  smq2: (n) => `${n} inbound ${n === '1' ? 'queue' : 'queues'}`,
  sm21: (n) => `${n} log ${n === '1' ? 'entry' : 'entries'} found`,
  sm58: (n) => `${n} pending tRFC(s)`,
  sm37: (n) => `${n} background running ${n === '1' ? 'job' : 'jobs'}`,
  cancel: (n) => `${n} cancelled ${n === '1' ? 'job' : 'jobs'}`,
  strust: (n) => `${n} ${n === '1' ? 'certificate' : 'certificates'} expired`,
  strustToday: (n) => `${n} ${n === '1' ? 'certificate' : 'certificates'} expiring today`,
  strust15d: (n) => `${n} ${n === '1' ? 'certificate' : 'certificates'} expiring in 15 days`,
  sm20: (n) => `${n} critical activity`,
};

/** A checklist parameter (ST22, Backup, SM13 …) as a tile. */
export function paramTile(param) {
  const raw = String(param.value ?? '').trim();
  const hasReading = raw !== '' && raw !== '—';
  const match = hasReading ? NUMERIC_RE.exec(raw) : null;

  // OS Monitoring (ST06) replaces the raw "Mem: …, Swap: …, CPU: …" sentence
  // with a short headline — the sentence itself still reaches the tile via
  // `hint` and the detail dialog's reading line.
  //
  // A count phrase applies even when the reading itself has no digit in it —
  // "No long running jobs found" reads as a count of zero just as much as
  // "1 error queue(s) found" reads as a count of one.
  const countPhraseFn = COUNT_PHRASES[param.key];
  const count = match ? match[0] : hasReading ? '0' : null;
  const countPhrase = countPhraseFn && count != null ? countPhraseFn(count) : null;
  const value = param.osStatus
    ? param.osStatus.allOk
      ? 'All Ok'
      : 'Attention'
    : countPhrase
      ? countPhrase
      : match
        ? match[0]
        : hasReading
          ? raw
          : '—';
  // Only worth repeating underneath when the headline actually dropped part of
  // the reading — a bare count like "2" has nothing left to say twice. A
  // count phrase already says everything the raw reading did, so it gets the
  // same treatment.
  const note = !param.osStatus && !countPhrase && match && match[0] !== raw ? raw : null;

  return {
    key: param.key,
    label: param.label,
    status: param.status,
    statusLabel: PARAM_STATE[param.status] ?? 'Attention',
    value,
    unit: null,
    note,
    // Count-phrase tiles ("4 errors found") open the same detail dialog as
    // any other flagged reading, but only the number itself is the link —
    // the words around it are just grammar, not part of what's clickable.
    linkPrefix: countPhrase ? count : null,
    hint: hasReading ? `Recorded reading: “${raw}”` : 'No reading recorded on this run.',
    // "All Ok" / "Attention" are short words, not numbers — same non-numeric
    // sizing sm13's "Update is Active" sentence gets, not the large digit
    // scale reserved for counts/amounts.
    scale:
      param.osStatus || countPhrase ? valueScale(value) : valueScale(value, { numeric: Boolean(match) }),
    meter: null,
    pie: null,
    severity: param.severity ?? null,
    // Present only on flagged checks — it is what makes the tile openable.
    detail: param.detail ?? null,
    sourceNote: param.carriedForwardNote ?? sourceNote(param.source, param.hasLiveApi),
    // Exposed directly (not just folded into sourceNote) because the detail
    // dialog shows it as its own fact row, next to which run it's from.
    hasLiveApi: param.hasLiveApi,
    // OS Monitoring (ST06) only: swaps the plain reading for a centered
    // headline plus a Memory/Swap/CPU checkbox row. Everything else about the
    // tile (status colour, click-to-open detail) is untouched.
    osStatus: param.osStatus ?? null,
    // Backup only: swaps the "Backup successful" / "Backup failed" sentence
    // for a single success/failure icon — the reading is pass/fail, and the
    // sentence adds nothing an icon plus the existing status word doesn't
    // already say.
    statusIcon: param.statusIcon ?? null,
  };
}

/**
 * A parsed volume/memory metric (data, log, app-server and DB memory) as a tile.
 *
 * `pie` swaps the meter bar for a ring beside the reading. The two encode exactly
 * the same thing — consumed against capacity — so a tile carries one or the other,
 * never both, and the headline steps down a size to leave the ring room.
 */
export function volumeTile(metric, { pie = false } = {}) {
  const { value, unit } = splitAmount(metric.usedText);
  const hasData = metric.usedGB != null;
  const withPie = pie && hasData;

  return {
    key: metric.key,
    label: metric.label,
    status: metric.level,
    statusLabel: metric.statusLabel,
    value: hasData ? value : '—',
    unit: hasData ? unit : null,
    note: hasData
      ? `${metric.usedText} used of ${metric.totalText} · ${metric.freeText} free`
      : metric.text,
    hint: metric.detailNote,
    scale: withPie ? 'md' : hasData ? valueScale(value, { numeric: true }) : 'md',
    meter:
      hasData && !withPie
        ? { percent: metric.percentUsed, label: `${metric.pctLabel} used` }
        : null,
    pie: withPie
      ? {
          percent: metric.percentUsed,
          label: `${metric.pctLabel} of ${metric.totalText} used — ${metric.usedText} used, ${metric.freeText} free`,
          caption: `used of ${metric.totalText}`,
        }
      : null,
    sourceNote: sourceNote(metric.source, metric.hasLiveApi),
  };
}

/** An endpoint reachability reading as a tile. */
export function endpointTile(endpoint) {
  return {
    key: endpoint.sid,
    label: endpoint.name,
    status: endpoint.reachable ? 'ok' : 'critical',
    statusLabel: endpoint.status,
    value: endpoint.status,
    unit: null,
    note: endpoint.host,
    hint: endpoint.url ?? endpoint.host ?? endpoint.name,
    scale: valueScale(endpoint.status),
    meter: null,
    pie: null,
  };
}
