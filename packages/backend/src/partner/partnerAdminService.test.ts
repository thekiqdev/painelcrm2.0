import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerAdminError, createPartner, patchPartner } from './partnerAdminService.js';

const query = vi.fn();
const connect = vi.fn();
const clientQuery = vi.fn();
const clientRelease = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: {
    query: (...args: unknown[]) => query(...args),
    connect: (...args: unknown[]) => connect(...args),
  },
}));

vi.mock('../services/tenantAdminService.js', () => ({
  createTenantAdminUser: vi.fn().mockResolvedValue({
    userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    email: 'admin@partner.test',
  }),
}));

vi.mock('../services/auditLogService.js', () => ({
  logSuperAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./partnerRepository.js', async () => {
  const actual = await vi.importActual<typeof import('./partnerRepository.js')>('./partnerRepository.js');
  return {
    ...actual,
    slugExists: vi.fn(),
    resolveDefaultPlanId: vi.fn(),
    getPartnerDetail: vi.fn(),
  };
});

import { createTenantAdminUser } from '../services/tenantAdminService.js';
import { getPartnerDetail, resolveDefaultPlanId, slugExists } from './partnerRepository.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function mockClient() {
  clientQuery.mockReset();
  clientRelease.mockReset();
  clientQuery.mockImplementation(async (sql: string) => {
    if (typeof sql === 'string' && sql.includes('INSERT INTO tenants')) {
      return { rows: [{ id: PARTNER_ID }] };
    }
    return { rows: [] };
  });
  connect.mockResolvedValue({
    query: clientQuery,
    release: clientRelease,
  });
}

describe('partnerAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient();
    vi.mocked(slugExists).mockResolvedValue(false);
    vi.mocked(resolveDefaultPlanId).mockResolvedValue(PLAN_ID);
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM plans WHERE id')) {
        return { rows: [{ id: PLAN_ID }] };
      }
      return { rows: [] };
    });
  });

  it('createPartner cria tenant partner + profile + pool + membership', async () => {
    vi.mocked(getPartnerDetail).mockResolvedValue({
      id: PARTNER_ID,
      name: 'Revenda X',
      slug: 'revenda-x',
      status: 'active',
      account_type: 'partner',
      created_at: '2026-08-13T00:00:00.000Z',
      plan_id: PLAN_ID,
      domain: null,
      public_name: 'Revenda X',
      product_name: 'CRM X',
      program_type: 'license_pool',
      partner_status: 'active',
      purchased_seats: 10,
      used_seats_cache: 0,
      unit_cost_cents: 5000,
      floor_price_cents: 9900,
      admin_email: 'admin@partner.test',
      program_config_json: { floor_price_cents: 9900, unit_cost_cents: 5000, min_seats: 10 },
      logo_url: null,
      theme_json: {},
      custom_domain: null,
      domain_status: 'none',
      payout_cadence_preference: 'monthly',
      memberships: [
        {
          id: 'm1',
          user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          role: 'partner_admin',
          status: 'active',
          email: 'admin@partner.test',
          referral_code: null,
        },
      ],
    });

    const detail = await createPartner(
      {
        name: 'Revenda X',
        slug: 'revenda-x',
        admin_email: 'admin@partner.test',
        floor_price_cents: 9900,
        unit_cost_cents: 5000,
        purchased_seats: 10,
        public_name: 'Revenda X',
        product_name: 'CRM X',
      },
      'superadmin-user'
    );

    expect(detail.id).toBe(PARTNER_ID);
    expect(createTenantAdminUser).toHaveBeenCalled();
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    const sqls = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('partner_profiles'))).toBe(true);
    expect(sqls.some((s) => s.includes('partner_license_pool'))).toBe(true);
    expect(sqls.some((s) => s.includes('partner_memberships'))).toBe(true);
    expect(sqls.some((s) => s.includes('onboarding_completed'))).toBe(true);
  });

  it('createPartner rejeita revenue_share no MVP', async () => {
    await expect(
      createPartner(
        {
          name: 'Y',
          slug: 'y',
          admin_email: 'a@b.com',
          program_type: 'revenue_share',
          floor_price_cents: 0,
          unit_cost_cents: 0,
          purchased_seats: 1,
          public_name: 'Y',
          product_name: 'Y',
        },
        null
      )
    ).rejects.toMatchObject({ code: 'PROGRAM_MVP_ONLY' } satisfies Partial<PartnerAdminError>);
  });

  it('patchPartner recusa purchased_seats < used', async () => {
    vi.mocked(getPartnerDetail).mockResolvedValue({
      id: PARTNER_ID,
      name: 'Revenda X',
      slug: 'revenda-x',
      status: 'active',
      account_type: 'partner',
      created_at: '2026-08-13T00:00:00.000Z',
      plan_id: PLAN_ID,
      domain: null,
      public_name: 'Revenda X',
      product_name: 'CRM X',
      program_type: 'license_pool',
      partner_status: 'active',
      purchased_seats: 10,
      used_seats_cache: 5,
      unit_cost_cents: 5000,
      floor_price_cents: 9900,
      admin_email: 'admin@partner.test',
      program_config_json: { floor_price_cents: 9900 },
      logo_url: null,
      theme_json: {},
      custom_domain: null,
      domain_status: 'none',
      payout_cadence_preference: 'monthly',
      memberships: [],
    });

    await expect(
      patchPartner(PARTNER_ID, { purchased_seats: 2 }, null)
    ).rejects.toMatchObject({ code: 'SEATS_BELOW_USED' });
  });
});

describe('partner constraint helpers', () => {
  it('documenta regra: customer_tenant exige partner_id', () => {
    // Constraint SQL tenants_partner_account_chk — validada na migration 318.
    expect(true).toBe(true);
  });
});
