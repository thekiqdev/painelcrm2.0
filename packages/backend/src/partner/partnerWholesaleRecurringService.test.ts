import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

vi.mock('./partnerWholesalePlanService.js', () => ({
  getWholesalePlan: vi.fn(),
}));

vi.mock('../services/billingSubscriptionService.js', () => ({
  getActiveSaasSubscriptionByTenant: vi.fn().mockResolvedValue(null),
  getOpenSaasSubscriptionByTenant: vi.fn().mockResolvedValue(null),
}));

import { getWholesalePlan } from './partnerWholesalePlanService.js';
import { getActiveSaasSubscriptionByTenant } from '../services/billingSubscriptionService.js';
import {
  computeWholesaleRecurringAmountCents,
  quoteWholesaleRecurringAmount,
  syncPartnerWholesaleRecurringAmount,
  tryResolveWholesaleRenewalAmount,
} from './partnerWholesaleRecurringService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('partnerWholesaleRecurringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [] });
  });

  it('computeWholesaleRecurringAmountCents = plano + extras × overage', () => {
    expect(
      computeWholesaleRecurringAmountCents({
        planPriceCents: 99900,
        extraSeats: 5,
        unitOverageCents: 3500,
      })
    ).toEqual({ recurring_amount_cents: 117400, extras_cents: 17500 });
    expect(
      computeWholesaleRecurringAmountCents({
        planPriceCents: 99900,
        extraSeats: 3,
        unitOverageCents: null,
      })
    ).toEqual({ recurring_amount_cents: 99900, extras_cents: 0 });
  });

  it('quoteWholesaleRecurringAmount monta o próximo ciclo', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          wholesale_plan_id: PLAN_ID,
          wholesale_subscription_id: SUB_ID,
          extra_seats: 2,
          included_seats: 10,
          purchased_seats: 12,
        },
      ],
    });
    query.mockResolvedValueOnce({
      rows: [{ id: SUB_ID, amount_cents: 99900 }],
    });
    vi.mocked(getWholesalePlan).mockResolvedValue({
      id: PLAN_ID,
      price_cents: 99900,
      unit_overage_cents: 3500,
      billing_interval: 'monthly',
    } as never);

    const q = await quoteWholesaleRecurringAmount(PARTNER_ID);
    expect(q?.recurring_amount_cents).toBe(106900);
    expect(q?.extras_cents).toBe(7000);
    expect(q?.subscription_id).toBe(SUB_ID);
    expect(q?.previous_amount_cents).toBe(99900);
  });

  it('syncPartnerWholesaleRecurringAmount atualiza snapshot sem mudar price_cents do plano', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM partner_profiles')) {
        return {
          rows: [
            {
              wholesale_plan_id: PLAN_ID,
              wholesale_subscription_id: SUB_ID,
              extra_seats: 4,
              included_seats: 10,
              purchased_seats: 14,
            },
          ],
        };
      }
      if (sql.includes('FROM subscriptions')) {
        return { rows: [{ id: SUB_ID, amount_cents: 99900 }] };
      }
      return { rows: [] };
    });
    vi.mocked(getWholesalePlan).mockResolvedValue({
      id: PLAN_ID,
      price_cents: 99900,
      unit_overage_cents: 2000,
      billing_interval: 'monthly',
    } as never);

    const synced = await syncPartnerWholesaleRecurringAmount(PARTNER_ID);
    expect(synced?.recurring_amount_cents).toBe(107900);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('pricing_snapshot_source = \'partner_wholesale\''),
      expect.arrayContaining([107900, 14, 'monthly', SUB_ID, PARTNER_ID])
    );
  });

  it('tryResolveWholesaleRenewalAmount só aplica em Partner atacado', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(
      tryResolveWholesaleRenewalAmount({ tenantId: PARTNER_ID, subscriptionId: SUB_ID })
    ).resolves.toBeNull();

    query.mockResolvedValueOnce({ rows: [{ ok: true }] });
    query.mockResolvedValueOnce({
      rows: [
        {
          wholesale_plan_id: PLAN_ID,
          wholesale_subscription_id: SUB_ID,
          extra_seats: 1,
          included_seats: 10,
          purchased_seats: 11,
        },
      ],
    });
    query.mockResolvedValueOnce({ rows: [{ id: SUB_ID, amount_cents: 99900 }] });
    vi.mocked(getWholesalePlan).mockResolvedValue({
      id: PLAN_ID,
      price_cents: 50000,
      unit_overage_cents: 1000,
      billing_interval: 'monthly',
    } as never);
    vi.mocked(getActiveSaasSubscriptionByTenant).mockResolvedValue(null);

    const resolved = await tryResolveWholesaleRenewalAmount({
      tenantId: PARTNER_ID,
      subscriptionId: SUB_ID,
    });
    expect(resolved).toEqual({ amountCents: 51000, extraSeats: 1, planPriceCents: 50000 });
  });
});
