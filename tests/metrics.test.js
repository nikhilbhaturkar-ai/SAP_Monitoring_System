import { describe, it, expect } from 'vitest';
import {
  parseVolume,
  round2,
  isAnomaly,
  formatGB,
  volumeSeverity,
  volumeInfo,
  formatDate,
  formatDateShort,
  THRESHOLDS,
} from '../lib/server/lib/metrics.js';

// ── parseVolume ────────────────────────────────────────────────────────────────

describe('parseVolume', () => {
  it('returns null for falsy input', () => {
    expect(parseVolume(null)).toBeNull();
    expect(parseVolume(undefined)).toBeNull();
    expect(parseVolume('')).toBeNull();
  });

  it('returns null when fewer than two size tokens', () => {
    expect(parseVolume('224.75 GB')).toBeNull();
    expect(parseVolume('no numbers here')).toBeNull();
  });

  it('parses used/total format (no "Free" keyword)', () => {
    const result = parseVolume('224.75 GB /2.91 TB');
    expect(result).not.toBeNull();
    expect(result.usedGB).toBe(224.75);
    expect(result.totalGB).toBe(round2(2.91 * 1024)); // 2979.84
    expect(result.freeGB).toBe(round2(result.totalGB - 224.75));
    expect(result.percentUsed).toBeCloseTo((224.75 / result.totalGB) * 100, 4);
  });

  it('parses Total/Free format', () => {
    const result = parseVolume('Total: 107GB / Free: 43 GB');
    expect(result).not.toBeNull();
    expect(result.totalGB).toBe(107);
    expect(result.freeGB).toBe(43);
    expect(result.usedGB).toBe(64);
  });

  it('parses Total/Free format with extra spaces and colons', () => {
    const result = parseVolume('Total : 62 GB  / Free : 24 GB');
    expect(result.totalGB).toBe(62);
    expect(result.freeGB).toBe(24);
    expect(result.usedGB).toBe(38);
  });

  it('handles TB in both positions', () => {
    const result = parseVolume('1 TB /2 TB');
    expect(result.usedGB).toBe(1024);
    expect(result.totalGB).toBe(2048);
  });

  it('returns null when total resolves to 0', () => {
    // used/total format where second value (total) is 0
    expect(parseVolume('0 GB /0 GB')).toBeNull();
  });
});

// ── round2 ─────────────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    // 1.005 has a known IEEE-754 representation slightly below 1.005, so it rounds to 1.00
    expect(round2(1.005)).toBeCloseTo(1.0, 1);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.0)).toBe(1);
    expect(round2(2.556)).toBe(2.56);
  });

  it('returns null for null input', () => {
    expect(round2(null)).toBeNull();
  });
});

// ── isAnomaly ──────────────────────────────────────────────────────────────────

describe('isAnomaly', () => {
  it('returns false when check is null/undefined', () => {
    expect(isAnomaly(null, 'anything')).toBe(false);
    expect(isAnomaly(undefined, 'anything')).toBe(false);
  });

  it('returns false for info checks', () => {
    expect(isAnomaly({ is_info: true, normal_text: '0' }, '5')).toBe(false);
  });

  it('returns false when normal_text is missing', () => {
    expect(isAnomaly({ is_info: false }, 'value')).toBe(false);
  });

  it('returns false when value is null or blank', () => {
    const check = { normal_text: '0' };
    expect(isAnomaly(check, null)).toBe(false);
    expect(isAnomaly(check, '')).toBe(false);
    expect(isAnomaly(check, '  ')).toBe(false);
  });

  it('numeric mode — returns false when value equals normal_text', () => {
    const check = { normal_text: '0' };
    expect(isAnomaly(check, '0')).toBe(false);
    expect(isAnomaly(check, 0)).toBe(false);
  });

  it('numeric mode — returns true when value differs', () => {
    const check = { normal_text: '0' };
    expect(isAnomaly(check, '3')).toBe(true);
    expect(isAnomaly(check, 3)).toBe(true);
  });

  it('numeric mode — returns true for non-numeric value', () => {
    const check = { normal_text: '0' };
    expect(isAnomaly(check, 'not a number')).toBe(true);
  });

  it('substring mode — returns false when value contains normal_text (case-insensitive)', () => {
    const check = { normal_text: 'backup successful' };
    expect(isAnomaly(check, 'Backup Successful on 2026-09-30')).toBe(false);
    expect(isAnomaly(check, 'BACKUP SUCCESSFUL')).toBe(false);
  });

  it('substring mode — returns true when value does not contain normal_text', () => {
    const check = { normal_text: 'backup successful' };
    expect(isAnomaly(check, 'Backup failed')).toBe(true);
    expect(isAnomaly(check, '')).toBe(false); // blank early-exit
  });

  it('substring mode — accessable spelling matches', () => {
    const check = { normal_text: 'accessable' };
    expect(isAnomaly(check, 'System is Accessable')).toBe(false);
    expect(isAnomaly(check, 'Not reachable')).toBe(true);
  });
});

// ── formatGB ───────────────────────────────────────────────────────────────────

describe('formatGB', () => {
  it('returns em-dash for null', () => {
    expect(formatGB(null)).toBe('—');
  });

  it('formats values under 1 TB as GB', () => {
    expect(formatGB(224.75)).toBe('224.75 GB');
    expect(formatGB(0)).toBe('0 GB');
  });

  it('formats values >= 1024 as TB', () => {
    expect(formatGB(1024)).toBe('1 TB');
    expect(formatGB(2979.84)).toBe('2.91 TB');
  });
});

// ── volumeSeverity ─────────────────────────────────────────────────────────────

describe('volumeSeverity', () => {
  it('returns unknown for null', () => {
    expect(volumeSeverity(null)).toEqual({ level: 'unknown', label: 'No data' });
  });

  it('returns normal for percent <= elevated threshold', () => {
    expect(volumeSeverity(0).level).toBe('normal');
    expect(volumeSeverity(THRESHOLDS.elevated).level).toBe('normal');
  });

  it('returns elevated for percent between elevated and critical', () => {
    expect(volumeSeverity(THRESHOLDS.elevated + 1).level).toBe('elevated');
    expect(volumeSeverity(THRESHOLDS.critical).level).toBe('elevated');
  });

  it('returns critical for percent above critical threshold', () => {
    expect(volumeSeverity(THRESHOLDS.critical + 0.1).level).toBe('critical');
    expect(volumeSeverity(100).level).toBe('critical');
  });
});

// ── volumeInfo ─────────────────────────────────────────────────────────────────

describe('volumeInfo', () => {
  it('returns no-data shape when used_gb or total_gb is null', () => {
    const result = volumeInfo({ raw: 'raw text', used_gb: null, total_gb: null }, 'today');
    expect(result.level).toBe('unknown');
    expect(result.text).toBe('raw text');
    expect(result.percentUsed).toBeNull();
  });

  it('returns full shape with correct percent and labels', () => {
    const result = volumeInfo({ raw: 'raw', used_gb: 64, total_gb: 107, free_gb: 43 }, '30 Sep 2026');
    expect(result.percentUsed).toBeCloseTo((64 / 107) * 100, 4);
    expect(result.usedText).toBe('64 GB');
    expect(result.totalText).toBe('107 GB');
    expect(result.freeText).toBe('43 GB');
    expect(result.level).toBe('normal');
    expect(result.detailNote).toContain('30 Sep 2026');
  });

  it('computes freeGB from total − used when free_gb is absent', () => {
    const result = volumeInfo({ raw: null, used_gb: 60, total_gb: 100 }, 'today');
    expect(result.freeGB).toBe(40);
  });
});

// ── formatDate / formatDateShort ───────────────────────────────────────────────

describe('formatDate', () => {
  it('formats ISO date string as en-GB long date', () => {
    const result = formatDate('2026-09-30');
    // Accept both "Sep" and "Sept" — Node locale data differs across platforms
    expect(result).toMatch(/^30 Sept? 2026$/);
  });

  it('includes day and year', () => {
    const result = formatDate('2026-01-15');
    expect(result).toContain('15');
    expect(result).toContain('2026');
  });
});

describe('formatDateShort', () => {
  it('formats ISO date string as en-GB short date (no year)', () => {
    const result = formatDateShort('2026-09-30');
    expect(result).toMatch(/^30 Sept?$/);
  });

  it('includes day but not year', () => {
    const result = formatDateShort('2026-01-15');
    expect(result).toContain('15');
    expect(result).not.toContain('2026');
  });
});
