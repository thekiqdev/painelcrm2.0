import { describe, it, expect } from 'vitest';
import { addInterval, calculateNextBillingDate } from './subscriptionService.js';

describe('calculateNextBillingDate', () => {
  it('weekly: avança 7 dias', () => {
    expect(calculateNextBillingDate('2026-06-01', 'weekly', null)).toBe('2026-06-08');
    expect(calculateNextBillingDate('2026-12-28', 'weekly', 15)).toBe('2027-01-04');
  });

  it('monthly: mantém comportamento existente', () => {
    expect(calculateNextBillingDate('2026-04-24', 'monthly', null)).toBe('2026-05-24');
    expect(calculateNextBillingDate('2026-01-31', 'monthly', null)).toBe('2026-02-28');
  });

  it('quarterly: mantém comportamento existente', () => {
    expect(calculateNextBillingDate('2026-04-24', 'quarterly', null)).toBe('2026-07-24');
  });

  it('semi_annual: mantém comportamento existente', () => {
    expect(calculateNextBillingDate('2026-04-24', 'semi_annual', null)).toBe('2026-10-24');
  });

  it('yearly: mantém comportamento existente', () => {
    expect(calculateNextBillingDate('2026-04-24', 'yearly', null)).toBe('2027-04-24');
  });

  it('intervalo desconhecido: lança erro', () => {
    expect(() =>
      calculateNextBillingDate('2026-04-24', 'biweekly' as 'weekly', null)
    ).toThrow(/Unsupported billing interval/);
  });
});

describe('addInterval', () => {
  it('weekly: +7 dias UTC', () => {
    const start = new Date('2026-06-01T12:00:00.000Z');
    const next = addInterval(start, 'weekly');
    expect(next.toISOString().slice(0, 10)).toBe('2026-06-08');
  });

  it('monthly: mantém comportamento existente', () => {
    const start = new Date('2026-04-24T12:00:00.000Z');
    const next = addInterval(start, 'monthly');
    expect(next.getUTCMonth()).toBe(4);
    expect(next.getUTCDate()).toBe(24);
  });

  it('intervalo desconhecido: lança erro', () => {
    const start = new Date('2026-06-01T12:00:00.000Z');
    expect(() => addInterval(start, 'daily' as 'weekly')).toThrow(/Unsupported billing interval/);
  });
});
