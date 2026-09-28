import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./partnerRepository.js', () => ({
  getPartnerLicensePool: vi.fn(),
  getPartnerProfile: vi.fn(),
}));

import { pool } from '../utils/db.js';
import { getPartnerLicensePool, getPartnerProfile } from './partnerRepository.js';
import {
  assertPartnerPoolAllowsNewUser,
  getPartnerLicenseSummary,
} from './partnerLicenseService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('partnerLicenseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPartnerLicenseSummary calcula available', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ c: '3' }] };
      if (sql.includes('partner_wholesale_plans')) {
        return {
          rows: [
            {
              wholesale_plan_id: 'wp-1',
              wholesale_status: 'active',
              wholesale_plan_name: 'Atacado 10',
              unit_overage_cents: 3500,
              seats_included: 10,
              price_cents: 99900,
              billing_interval: 'monthly',
            },
          ],
        };
      }
      if (sql.includes('FROM partner_profiles') && sql.includes('wholesale_status')) {
        return {
          rows: [
            {
              wholesale_status: 'active',
              wholesale_subscription_id: null,
              wholesale_plan_id: 'wp-1',
            },
          ],
        };
      }
      return { rows: [] };
    });
    vi.mocked(getPartnerLicensePool).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      purchased_seats: 10,
      included_seats: 10,
      extra_seats: 0,
      unit_cost_cents: 5000,
      used_seats_cache: 0,
      updated_at: '',
    });
    vi.mocked(getPartnerProfile).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      program_type: 'license_pool',
      program_config_json: { floor_price_cents: 9900 },
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

    const s = await getPartnerLicenseSummary(PARTNER_ID);
    expect(s.used_seats).toBe(3);
    expect(s.available_seats).toBe(7);
    expect(s.floor_price_cents).toBe(9900);
    expect(s.topup_unit_price_cents).toBe(3500);
    expect(s.topup_price_source).toBe('wholesale_overage');
    expect(s.topup_available).toBe(true);
    expect(s.included_seats).toBe(10);
    expect(s.extra_seats).toBe(0);
    expect(s.recurring_amount_cents).toBe(99900);
    expect(s.recurring_plan_price_cents).toBe(99900);
    expect(s.recurring_extras_cents).toBe(0);
    expect(s.downgrade_max_qty).toBe(0);
  });

  it('getPartnerLicenseSummary bloqueia avulso sem Custo seat avulso', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ c: '0' }] };
      if (sql.includes('partner_wholesale_plans')) {
        return {
          rows: [
            {
              wholesale_plan_id: 'wp-1',
              wholesale_status: 'active',
              wholesale_plan_name: 'Atacado',
              unit_overage_cents: null,
              seats_included: 10,
            },
          ],
        };
      }
      return { rows: [] };
    });
    vi.mocked(getPartnerLicensePool).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      purchased_seats: 10,
      included_seats: 10,
      extra_seats: 0,
      unit_cost_cents: 5000,
      used_seats_cache: 0,
      updated_at: '',
    });
    vi.mocked(getPartnerProfile).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      program_type: 'license_pool',
      program_config_json: {},
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

    const s = await getPartnerLicenseSummary(PARTNER_ID);
    expect(s.topup_available).toBe(false);
    expect(s.topup_price_source).toBe('unavailable');
    expect(s.topup_unit_price_cents).toBeNull();
  });

  it('assertPartnerPoolAllowsNewUser bloqueia quando cheio', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ c: '10' }] };
      if (sql.includes('partner_wholesale_plans')) {
        return {
          rows: [{ wholesale_plan_id: null, wholesale_status: 'none', unit_overage_cents: null }],
        };
      }
      if (sql.includes('FROM partner_profiles') && sql.includes('wholesale_status')) {
        return {
          rows: [
            {
              wholesale_status: 'active',
              wholesale_subscription_id: null,
              wholesale_plan_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    });
    vi.mocked(getPartnerLicensePool).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      purchased_seats: 10,
      unit_cost_cents: 0,
      used_seats_cache: 10,
      updated_at: '',
    });
    vi.mocked(getPartnerProfile).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      program_type: 'license_pool',
      program_config_json: {},
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

    await expect(assertPartnerPoolAllowsNewUser(PARTNER_ID)).rejects.toMatchObject({
      code: 'LICENSE_POOL_EXHAUSTED',
    });
  });

  it('assertPartnerPoolAllowsNewUser bloqueia past_due (freeze)', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM partner_profiles') && sql.includes('wholesale_status')) {
        return {
          rows: [
            {
              wholesale_status: 'past_due',
              wholesale_subscription_id: 'sub-1',
              wholesale_plan_id: 'wp-1',
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(assertPartnerPoolAllowsNewUser(PARTNER_ID)).rejects.toMatchObject({
      code: 'WHOLESALE_CHANNEL_FROZEN',
    });
  });
});
