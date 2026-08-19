import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./partnerRepository.js', () => ({
  getPartnerProfile: vi.fn(),
  getPartnerLicensePool: vi.fn(),
}));

vi.mock('./partnerLicenseService.js', async () => {
  const actual = await vi.importActual<typeof import('./partnerLicenseService.js')>(
    './partnerLicenseService.js'
  );
  return {
    ...actual,
    canPartnerSellWithGateway: vi.fn().mockResolvedValue({ ok: true, reason: 'ok' }),
    getPartnerLicenseSummary: vi.fn().mockResolvedValue({
      partner_tenant_id: 'p1',
      purchased_seats: 10,
      used_seats: 0,
      available_seats: 10,
      unit_cost_cents: 5000,
      floor_price_cents: 9900,
      program_type: 'license_pool',
    }),
  };
});

import { pool } from '../utils/db.js';
import { getPartnerProfile } from './partnerRepository.js';
import { canPartnerSellWithGateway } from './partnerLicenseService.js';
import {
  createPartnerSellPlan,
  projectSellPlanEarnings,
} from './partnerSellPlanService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('partnerSellPlanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canPartnerSellWithGateway).mockResolvedValue({ ok: true, reason: 'ok' });
    vi.mocked(getPartnerProfile).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      program_type: 'license_pool',
      program_config_json: { floor_price_cents: 9900, unit_cost_cents: 5000 },
      public_name: 'P',
      product_name: 'P',
      custom_domain: null,
      domain_status: 'none',
      domain_verification_token: null,
      logo_url: null,
      theme_json: {},
      payout_cadence_preference: 'monthly',
      status: 'active',
      created_at: '',
      updated_at: '',
    });
  });

  it('rejeita preço abaixo do piso', async () => {
    await expect(
      createPartnerSellPlan(PARTNER_ID, { name: 'Basic', price_cents: 5000 })
    ).rejects.toMatchObject({ code: 'PRICE_BELOW_FLOOR' });
  });

  it('cria plano draft com preço válido', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          id: 'plan1',
          partner_tenant_id: PARTNER_ID,
          source_platform_plan_id: null,
          name: 'Pro',
          slug: 'pro',
          price_cents: 14900,
          billing_interval: 'monthly',
          features_json: {},
          status: 'draft',
          trial_days: 7,
          created_at: '2026-08-13',
          updated_at: '2026-08-13',
        },
      ],
    } as never);

    const plan = await createPartnerSellPlan(PARTNER_ID, {
      name: 'Pro',
      price_cents: 14900,
      trial_days: 7,
    });
    expect(plan.slug).toBe('pro');
    expect(plan.price_cents).toBe(14900);
    expect(plan.trial_days).toBe(7);
    const insertCall = vi.mocked(pool.query).mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO partner_sell_plans')
    );
    expect(insertCall?.[1]?.[8]).toBe(7);
  });

  it('projectSellPlanEarnings calcula margem', async () => {
    const p = await projectSellPlanEarnings(PARTNER_ID, {
      price_cents: 14900,
      billing_interval: 'monthly',
      estimated_customers: 2,
      estimated_users_per_customer: 1,
    });
    expect(p.projected_revenue_cents).toBe(29800);
    expect(p.projected_cost_cents).toBe(10000);
    expect(p.projected_margin_cents).toBe(19800);
  });
});
