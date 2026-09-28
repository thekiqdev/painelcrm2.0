import { describe, it, expect } from 'vitest';
import {
  JS_DATE_STRING_HEAD_RE,
  normalizeBillingCycleKeyYmd,
  normalizeSubscriptionNextBillingYmd,
} from './billingCycleKey.js';

describe('normalizeBillingCycleKeyYmd', () => {
  it('passes through YYYY-MM-DD', () => {
    expect(normalizeBillingCycleKeyYmd('2026-07-14')).toBe('2026-07-14');
  });

  it('strips ISO suffix', () => {
    expect(normalizeBillingCycleKeyYmd('2026-07-14T00:00:00.000Z')).toBe('2026-07-14');
  });

  it('parses Date.toString() without returning Tue Jun 30', () => {
    const raw = new Date('2026-06-30T12:00:00Z').toString();
    expect(JS_DATE_STRING_HEAD_RE.test(raw)).toBe(true);
    expect(normalizeBillingCycleKeyYmd(raw)).toBe('2026-06-30');
    expect(normalizeBillingCycleKeyYmd(raw)).not.toBe('Tue Jun 30');
  });

  it('never returns first 10 chars of invalid js date string without year', () => {
    expect(normalizeBillingCycleKeyYmd('Tue Jun 30')).not.toBe('Tue Jun 30');
  });

  it('returns empty for garbage', () => {
    expect(normalizeBillingCycleKeyYmd('not-a-date')).toBe('');
  });
});

describe('normalizeSubscriptionNextBillingYmd', () => {
  it('accepts Date object', () => {
    expect(normalizeSubscriptionNextBillingYmd(new Date('2026-07-14T12:00:00Z'))).toBe('2026-07-14');
  });

  it('parses Date.toString()', () => {
    const raw = new Date('2026-06-30T12:00:00Z').toString();
    expect(normalizeSubscriptionNextBillingYmd(raw)).toBe('2026-06-30');
  });

  it('rejects garbage', () => {
    expect(normalizeSubscriptionNextBillingYmd('Tue Jun 30')).toBe('');
  });
});
