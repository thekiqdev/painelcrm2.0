import { describe, it, expect, vi } from 'vitest';
import {
  formatYmdBrSafe,
  formatDateTimeBrSafe,
  formatYmdBrShortSafe,
  safeParseYmd,
  safeDate,
  safeToISOString,
  safeNowIso,
  isValidYmd,
  financialTodayYmd,
  resolveFinancialTimeZone,
  DEFAULT_FINANCIAL_TIMEZONE,
} from './billingSafeDate';

describe('billingSafeDate frontend', () => {
  it('isValidYmd e safeParseYmd', () => {
    expect(isValidYmd('2026-06-24')).toBe(true);
    expect(safeParseYmd('bad')).toBeNull();
    expect(safeParseYmd('2026-06-24')).toBe('2026-06-24');
  });

  it('formatYmdBrSafe não lança com lixo', () => {
    expect(formatYmdBrSafe(null)).toBe('—');
    expect(formatYmdBrSafe('not-a-date')).toBe('not-a-date');
    expect(formatYmdBrSafe('2026-06-24')).toMatch(/24\/06\/2026/);
  });

  it('formatDateTimeBrSafe e formatYmdBrShortSafe', () => {
    expect(formatDateTimeBrSafe('invalid')).toBe('invalid');
    expect(formatYmdBrShortSafe('2026-06-24')).toMatch(/24\/06\/26/);
  });

  it('safeDate e safeToISOString', () => {
    expect(safeDate('x')).toBeNull();
    expect(safeToISOString('2026-06-24')).toMatch(/2026-06-24/);
  });

  it('financialTodayYmd usa fuso da conta', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T03:00:00.000Z'));
    expect(financialTodayYmd('America/Sao_Paulo')).toBe('2026-06-30');
    expect(financialTodayYmd('UTC')).toBe('2026-06-30');
    vi.useRealTimers();
  });

  it('financialTodayYmd não depende do fuso do servidor para SP', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T02:30:00.000Z'));
    expect(financialTodayYmd('America/Sao_Paulo')).toBe('2026-06-30');
    expect(financialTodayYmd('UTC')).toBe('2026-07-01');
    vi.useRealTimers();
  });

  it('resolveFinancialTimeZone fallback', () => {
    expect(resolveFinancialTimeZone(null)).toBe(DEFAULT_FINANCIAL_TIMEZONE);
    expect(resolveFinancialTimeZone('Invalid/Zone')).toBe(DEFAULT_FINANCIAL_TIMEZONE);
    expect(resolveFinancialTimeZone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
  });
});
