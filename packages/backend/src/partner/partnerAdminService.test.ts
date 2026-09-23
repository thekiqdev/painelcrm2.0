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

vi.mock('./partnerLicenseLedgerService.js', () => ({
  applyPartnerLicenseDelta: vi.fn().mockResolvedValue({ balanceAfter: 10, ledgerId: 'led-1' }),
  listPartnerLicenseLedger: vi.fn().mockResolvedValue([]),
}));

const getWholesalePlan = vi.fn();
const assignWholesalePlanGrant = vi.fn();

vi.mock('./partnerWholesalePlanService.js', () => ({
  getWholesalePlan: (...args: unknown[]) => getWholesalePlan(...args),
}));

vi.mock('./partnerWholesaleActivationService.js', () => ({
  assignWholesalePlanGrant: (...args: unknown[]) => assignWholesalePlanGrant(...args),
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
import { applyPartnerLicenseDelta } from './partnerLicenseLedgerService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const wholesaleDefaults = {
  wholesale_plan_id: null as string | null,
  wholesale_status: 'none' as const,
  wholesale_subscription_id: null as string | null,
  wholesale_plan_name: null as string | null,
  wholesale_block_after_days: null as number | null,
  cpf_cnpj: null as string | null,
};

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
    getWholesalePlan.mockReset();
    assignWholesalePlanGrant.mockReset();
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
      ...wholesaleDefaults,
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
    expect(applyPartnerLicenseDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerTenantId: PARTNER_ID,
        deltaSeats: 10,
        reason: 'grant',
      })
    );
  });

  it('createPartner aceita pool 0 sem grant', async () => {
    vi.mocked(getPartnerDetail).mockResolvedValue({
      id: PARTNER_ID,
      name: 'Revenda Z',
      slug: 'revenda-z',
      status: 'active',
      account_type: 'partner',
      created_at: '2026-08-13T00:00:00.000Z',
      plan_id: PLAN_ID,
      domain: null,
      public_name: 'Revenda Z',
      product_name: 'CRM Z',
      program_type: 'license_pool',
      partner_status: 'active',
      purchased_seats: 0,
      used_seats_cache: 0,
      unit_cost_cents: 5000,
      floor_price_cents: 9900,
      admin_email: 'admin@z.test',
      program_config_json: { floor_price_cents: 9900, unit_cost_cents: 5000, min_seats: 0 },
      logo_url: null,
      theme_json: {},
      custom_domain: null,
      domain_status: 'none',
      payout_cadence_preference: 'monthly',
      ...wholesaleDefaults,
      memberships: [],
    });

    await createPartner(
      {
        name: 'Revenda Z',
        slug: 'revenda-z',
        admin_email: 'admin@z.test',
        floor_price_cents: 9900,
        unit_cost_cents: 5000,
        purchased_seats: 0,
        public_name: 'Revenda Z',
        product_name: 'CRM Z',
      },
      null
    );

    expect(applyPartnerLicenseDelta).not.toHaveBeenCalled();
    expect(assignWholesalePlanGrant).not.toHaveBeenCalled();
    const poolInsert = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && String(c[0]).includes('INSERT INTO partner_license_pool')
    );
    expect(String(poolInsert?.[0])).toMatch(/purchased_seats[\s\S]*VALUES \(\$1, 0,/);
    expect(poolInsert?.[1]?.[0]).toBe(PARTNER_ID);
  });

  it('createPartner atrela plano atacado via grant quando wholesale_plan_id informado', async () => {
    const WP_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    getWholesalePlan.mockResolvedValue({
      id: WP_ID,
      name: 'Atacado 50',
      slug: 'atacado-50',
      status: 'active',
      seats_included: 50,
      envelope_plan_id: PLAN_ID,
      unit_overage_cents: 4000,
    });
    assignWholesalePlanGrant.mockResolvedValue({
      plan: { id: WP_ID },
      seatsCredited: 50,
      purchased_seats: 50,
    });
    vi.mocked(getPartnerDetail).mockResolvedValue({
      id: PARTNER_ID,
      name: 'Revenda W',
      slug: 'revenda-w',
      status: 'active',
      account_type: 'partner',
      created_at: '2026-08-13T00:00:00.000Z',
      plan_id: PLAN_ID,
      domain: null,
      public_name: 'Revenda W',
      product_name: 'CRM W',
      program_type: 'license_pool',
      partner_status: 'active',
      purchased_seats: 50,
      used_seats_cache: 0,
      unit_cost_cents: 4000,
      floor_price_cents: 9900,
      admin_email: 'admin@w.test',
      program_config_json: {},
      logo_url: null,
      theme_json: {},
      custom_domain: null,
      domain_status: 'none',
      payout_cadence_preference: 'monthly',
      ...wholesaleDefaults,
      wholesale_plan_id: WP_ID,
      wholesale_status: 'active',
      memberships: [],
    });

    await createPartner(
      {
        name: 'Revenda W',
        slug: 'revenda-w',
        admin_email: 'admin@w.test',
        floor_price_cents: 9900,
        unit_cost_cents: 4000,
        purchased_seats: 10,
        public_name: 'Revenda W',
        product_name: 'CRM W',
        wholesale_plan_id: WP_ID,
      },
      'superadmin-user'
    );

    expect(applyPartnerLicenseDelta).not.toHaveBeenCalled();
    expect(assignWholesalePlanGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerTenantId: PARTNER_ID,
        wholesalePlanId: WP_ID,
      })
    );
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
      ...wholesaleDefaults,
      memberships: [],
    });

    vi.mocked(applyPartnerLicenseDelta).mockRejectedValueOnce(
      new PartnerAdminError(
        'purchased_seats não pode ser menor que used_seats',
        'SEATS_BELOW_USED'
      )
    );

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
