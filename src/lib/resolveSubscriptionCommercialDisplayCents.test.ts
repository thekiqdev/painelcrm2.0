import { describe, expect, it } from 'vitest';
import { resolveSubscriptionCommercialDisplayCents } from './resolveSubscriptionCommercialDisplayCents';

describe('resolveSubscriptionCommercialDisplayCents (CS S3)', () => {
  it('standard: prefere contracted_plan_price_cents', () => {
    expect(
      resolveSubscriptionCommercialDisplayCents({
        planType: 'standard',
        amountCents: 6900,
        contractedPlanPriceCents: 50000,
      })
    ).toBe(50000);
  });

  it('standard: fallback amount_cents', () => {
    expect(
      resolveSubscriptionCommercialDisplayCents({
        planType: 'standard',
        amountCents: 6900,
        contractedPlanPriceCents: null,
      })
    ).toBe(6900);
  });

  it('custom: unitário × assentos', () => {
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
