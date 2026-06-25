import { describe, it, expect } from 'vitest';
import { isValidYmd, safeParseYmd, safeDate, safeToISOString } from './billingSafeDate.js';

describe('billingSafeDate', () => {
  it('valida YMD civil', () => {
    expect(isValidYmd('2026-06-24')).toBe(true);
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('invalid')).toBe(false);
  });

  it('safeParseYmd rejeita Invalid time value', () => {
    expect(safeParseYmd('not-a-date')).toBeNull();
    expect(safeParseYmd('')).toBeNull();
    expect(safeParseYmd('2026-06-24T00:00:00.000Z')).toBe('2026-06-24');
  });

  it('safeDate e safeToISOString não lançam', () => {
    expect(safeDate('garbage')).toBeNull();
    expect(safeToISOString('garbage')).toBeNull();
    const iso = safeToISOString('2026-06-24');
    expect(iso).toMatch(/2026-06-24/);
  });
});
