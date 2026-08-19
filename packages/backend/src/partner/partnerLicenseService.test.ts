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
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ c: '3' }] } as never);
    vi.mocked(getPartnerLicensePool).mockResolvedValue({
      partner_tenant_id: PARTNER_ID,
      purchased_seats: 10,
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
  });

  it('assertPartnerPoolAllowsNewUser bloqueia quando cheio', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ c: '10' }] } as never);
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
});
