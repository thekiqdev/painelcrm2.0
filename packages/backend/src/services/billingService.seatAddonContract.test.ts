import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateSeatAddonProrata,
  tryResolveSubscriptionLineAmountFromContractSnapshot,
} from './billingService.js';

describe('tryResolveSubscriptionLineAmountFromContractSnapshot', () => {
  it('custom: usa contracted_price_per_user_cents × usuários', () => {
    expect(
      tryResolveSubscriptionLineAmountFromContractSnapshot('custom', 2, null, 4990)
    ).toBe(9980);
    expect(
      tryResolveSubscriptionLineAmountFromContractSnapshot('custom', 1, null, 6990)
    ).toBe(6990);
  });

  it('custom: sem unitário no snapshot → null (fallback catálogo)', () => {
    expect(
      tryResolveSubscriptionLineAmountFromContractSnapshot('custom', 5, 25000, null)
    ).toBeNull();
  });

  it('standard: usa contracted_plan_price_cents flat', () => {
    expect(
      tryResolveSubscriptionLineAmountFromContractSnapshot('standard', 99, 4990, null)
    ).toBe(4990);
  });
});

describe('calculateSeatAddonProrata — preço contratado por usuário', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('prioriza contractedPricePerUserCents sobre catálogo (base pró-rata)', async () => {
    const r = await calculateSeatAddonProrata(
      '00000000-0000-0000-0000-000000000001',
      'monthly',
      1,
      '2026-01-01',
      '2026-01-31',
      { contractedPricePerUserCents: 4990 }
    );
    expect(r.price_per_user_full_period_cents).toBe(4990);
    expect(r.additional_seats).toBe(1);
    expect(r.amount_cents).toBeGreaterThan(0);
    expect(r.amount_cents).toBe(
      Math.round(1 * 4990 * (r.remaining_period_days / r.total_period_days))
    );
  });
});
