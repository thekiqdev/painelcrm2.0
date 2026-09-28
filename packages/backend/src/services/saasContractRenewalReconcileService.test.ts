import { describe, expect, it } from 'vitest';
import {
  openPlanRenewalAmountIsStale,
  resolveExpectedRenewalAmountCents,
  resolveSubscriptionCommercialDisplayCents,
} from './saasContractRenewalReconcileService.js';

describe('resolveExpectedRenewalAmountCents (CS S2)', () => {
  it('prefere contracted_plan_price_cents quando presente', () => {
    expect(
      resolveExpectedRenewalAmountCents({
        amountCents: 6900,
        contractedPlanPriceCents: 50000,
      })
    ).toBe(50000);
  });

  it('usa amount_cents quando snapshot ausente', () => {
    expect(
      resolveExpectedRenewalAmountCents({
        amountCents: 50000,
        contractedPlanPriceCents: null,
      })
    ).toBe(50000);
  });

  it('aceita contracted 0 (plano cortesia)', () => {
    expect(
      resolveExpectedRenewalAmountCents({
        amountCents: 6900,
        contractedPlanPriceCents: 0,
      })
    ).toBe(0);
  });
});

describe('resolveSubscriptionCommercialDisplayCents (CS S3)', () => {
  it('standard: prefere snapshot flat', () => {
    expect(
      resolveSubscriptionCommercialDisplayCents({
        planType: 'standard',
        amountCents: 6900,
        contractedPlanPriceCents: 50000,
        contractedPricePerUserCents: null,
        usersCount: 1,
      })
    ).toBe(50000);
  });

  it('custom: unitário × seats', () => {
    expect(
      resolveSubscriptionCommercialDisplayCents({
        planType: 'custom',
        amountCents: 9999,
        contractedPlanPriceCents: 9999,
        contractedPricePerUserCents: 2500,
        usersCount: 4,
      })
    ).toBe(10000);
  });
});

describe('openPlanRenewalAmountIsStale (CS S2)', () => {
  it('marca stale quando valor aberto ≠ contratado', () => {
    expect(openPlanRenewalAmountIsStale(6900, 50000)).toBe(true);
  });

  it('não marca stale quando valores iguais', () => {
    expect(openPlanRenewalAmountIsStale(50000, 50000)).toBe(false);
  });
});
