import { describe, it, expect } from 'vitest';
import {
  assertBillingDate,
  assertBillingCycle,
  assertCycleIntegrity,
  assertPeriod,
  BillingRuntimeAssertionError,
  normalizeBillingDateFromDb,
  trySanitizeSqlDateParam,
} from './billingRuntimeAssertions.js';

describe('billingRuntimeAssertions', () => {
  it('rejects Tue Jun 30 from String(Date).slice pattern', () => {
    const d = new Date('2026-06-30T12:00:00Z');
    const bad = d.toString().slice(0, 10);
    expect(bad).toBe('Tue Jun 30');
    expect(() => assertBillingDate(bad, 'cycle_date')).toThrow(BillingRuntimeAssertionError);
    const audit = trySanitizeSqlDateParam(bad);
    expect(audit.valid).toBe(false);
    expect(audit.rejectedReason).toBe('js_date_tostring_slice');
  });

  it('normalizes PG Date object via civil calendar', () => {
    const d = new Date('2026-06-30T12:00:00Z');
    expect(normalizeBillingDateFromDb(d)).toBe('2026-06-30');
    expect(assertBillingDate(d, 'cycle_date')).toBe('2026-06-30');
  });

  it('accepts YMD string', () => {
    expect(assertBillingCycle('2026-07-14')).toBe('2026-07-14');
  });

  it('assertPeriod rejects inverted range', () => {
    expect(() => assertPeriod({ start: '2026-08-01', end: '2026-07-01' })).toThrow(BillingRuntimeAssertionError);
  });

  it('assertCycleIntegrity passes valid cycle', () => {
    const r = assertCycleIntegrity({
      cycle_date: '2026-07-14',
      period_start: '2026-07-14',
      period_end: '2026-07-21',
    });
    expect(r.cycle_date).toBe('2026-07-14');
  });
});

describe('root cause — String(Date).slice(0,10)', () => {
  it('produces Tue Jun 30 and is blocked', () => {
    const pgDate = new Date(2026, 5, 30);
    const legacyBug = String(pgDate).slice(0, 10);
    expect(legacyBug.startsWith('Tue Jun')).toBe(true);
    expect(trySanitizeSqlDateParam(legacyBug).valid).toBe(false);
    expect(normalizeBillingDateFromDb(pgDate)).toBe('2026-06-30');
  });
});
