import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./partnerSellPlanService.js', () => ({
  getPartnerSellPlan: vi.fn(),
  listActivePartnerSellPlans: vi.fn(),
}));

vi.mock('./partnerRepository.js', () => ({
  resolveDefaultPlanId: vi.fn().mockResolvedValue('platform-plan-1'),
}));

import { pool } from '../utils/db.js';
import { getPartnerSellPlan } from './partnerSellPlanService.js';
import {
  applyPartnerCommercialOverlay,
  getPartnerSellPlanOverlay,
} from './partnerChannelCustomerPlans.js';

describe('partnerChannelCustomerPlans commercial overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applyPartnerCommercialOverlay força plan_type standard e limpa interval_prices', () => {
    const plan: Record<string, unknown> = {
      id: 'platform-uuid',
      name: 'CRM Pro',
      price_cents: 19900,
      plan_type: 'custom',
      billing_interval: 'monthly',
      interval_prices: [{ billing_interval: 'monthly', price_per_user_cents: 9900 }],
    };
    applyPartnerCommercialOverlay(plan, {
      partner_sell_plan_id: 'sell-1',
      name: 'Canal Starter',
      slug: 'canal-starter',
      price_cents: 7900,
      billing_interval: 'monthly',
      trial_days: 7,
      benefits: [{ label: 'Suporte' }],
      channel: 'partner',
    });
    expect(plan.name).toBe('Canal Starter');
    expect(plan.price_cents).toBe(7900);
    expect(plan.plan_type).toBe('standard');
    expect(plan.interval_prices).toEqual([]);
    expect(plan.envelope_plan_id).toBe('platform-uuid');
    expect(plan.partner_sell_plan_id).toBe('sell-1');
    expect(plan.free_access_days).toBe(7);
  });

  it('getPartnerSellPlanOverlay retorna null sem partner_sell_plan_id', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          tenant_id: 't1',
          account_type: 'customer_tenant',
          partner_id: 'p1',
          partner_sell_plan_id: null,
          plan_id: 'plat-1',
          has_used_trial: false,
        },
      ],
    } as never);
    expect(await getPartnerSellPlanOverlay('t1')).toBeNull();
  });

  it('getPartnerSellPlanOverlay retorna sell plan do Partner', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          tenant_id: 't1',
          account_type: 'customer_tenant',
          partner_id: 'p1',
          partner_sell_plan_id: 'sell-1',
          plan_id: 'plat-1',
          has_used_trial: false,
        },
      ],
    } as never);
    vi.mocked(getPartnerSellPlan).mockResolvedValueOnce({
      id: 'sell-1',
      partner_tenant_id: 'p1',
      source_platform_plan_id: 'plat-1',
      name: 'Meu Plano',
      slug: 'meu-plano',
      price_cents: 5500,
      billing_interval: 'monthly',
      features_json: {},
      status: 'active',
      trial_days: 0,
      created_at: '2026-08-17',
      updated_at: '2026-08-17',
    });
    const overlay = await getPartnerSellPlanOverlay('t1');
    expect(overlay?.name).toBe('Meu Plano');
    expect(overlay?.price_cents).toBe(5500);
  });
});
