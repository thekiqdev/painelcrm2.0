import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateInstanceAddonProrata } from './billingService.js';

describe('calculateInstanceAddonProrata — preço contratado por conexão', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prioriza contractedPricePerInstanceCents sobre catálogo (base pró-rata)', async () => {
    const r = await calculateInstanceAddonProrata(
      '00000000-0000-0000-0000-000000000001',
      'monthly',
      2,
      '2026-01-01',
      '2026-01-31',
      { contractedPricePerInstanceCents: 1990 }
    );
    expect(r.price_per_instance_full_period_cents).toBe(1990);
    expect(r.additional_instances).toBe(2);
    expect(r.amount_cents).toBeGreaterThan(0);
    expect(r.amount_cents).toBe(
      Math.round(2 * 1990 * (r.remaining_period_days / r.total_period_days))
    );
  });
});
