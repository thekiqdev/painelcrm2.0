import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../utils/bcrypt.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hash'),
}));

vi.mock('../services/tenantAdminService.js', () => ({
  createTenantAdminUser: vi.fn().mockResolvedValue({
    userId: 'user-1',
    email: 'admin@cliente.test',
  }),
}));

vi.mock('./partnerLicenseService.js', () => ({
  assertPartnerPoolAllowsNewUser: vi.fn().mockResolvedValue(undefined),
  getPartnerLicenseSummary: vi.fn().mockResolvedValue({
    partner_tenant_id: 'partner-1',
    purchased_seats: 10,
    used_seats: 2,
    available_seats: 8,
    unit_cost_cents: 1000,
    floor_price_cents: 5000,
    program_type: 'license_pool',
  }),
  refreshPartnerUsedSeatsCache: vi.fn().mockResolvedValue(3),
}));

vi.mock('./partnerSellPlanService.js', () => ({
  getPartnerSellPlan: vi.fn(),
}));

vi.mock('./partnerRepository.js', () => ({
  resolveDefaultPlanId: vi.fn().mockResolvedValue('plan-platform-1'),
}));

vi.mock('../services/tenantOperationalBootstrapService.js', () => ({
  ensureTenantOperationalBootstrap: vi.fn().mockResolvedValue(undefined),
}));

const deleteTenantWithDependencies = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/tenantDeletionService.js', () => ({
  deleteTenantWithDependencies: (...args: unknown[]) => deleteTenantWithDependencies(...args),
}));

import { createTenantAdminUser } from '../services/tenantAdminService.js';
import { getPartnerLicenseSummary, refreshPartnerUsedSeatsCache } from './partnerLicenseService.js';
import { getPartnerSellPlan } from './partnerSellPlanService.js';
import {
  createPartnerCustomer,
  deletePartnerCustomer,
  listPartnerCustomers,
  updatePartnerCustomer,
} from './partnerCustomerService.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { hashPassword } from '../utils/bcrypt.js';

const activeSellPlan = {
  id: 'sell-1',
  partner_tenant_id: 'partner-1',
  source_platform_plan_id: 'plan-platform-1',
  name: 'Canal Basic',
  slug: 'canal-basic',
  price_cents: 9900,
  billing_interval: 'monthly',
  features_json: {},
  status: 'active' as const,
  trial_days: 0,
  created_at: '2026-08-17',
  updated_at: '2026-08-17',
};

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-1',
    name: 'Cliente X',
    slug: 'cliente-x',
    status: 'active',
    plan_id: 'plan-platform-1',
    partner_sell_plan_id: null,
    sell_plan_name: null,
    sell_plan_price_cents: null,
    admin_email: 'admin@cliente.test',
    admin_name: 'Admin',
    seller_user_id: null,
    seller_name: null,
    seller_email: null,
    seller_referral_code: null,
    created_at: '2026-08-17',
    users_count: '1',
    seats_allocated: '5',
    ...overrides,
  };
}

describe('partnerCustomerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPartnerSellPlan).mockResolvedValue(activeSellPlan);
    clientQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO tenants')) {
        return { rows: [{ id: 'cust-1' }] };
      }
      if (typeof sql === 'string' && sql.includes('SELECT id FROM tenants WHERE slug')) {
        return { rows: [] };
      }
      if (typeof sql === 'string' && sql.includes('SELECT tenant_id FROM tenant_plan')) {
        return { rows: [{ tenant_id: 'cust-1' }] };
      }
      return { rows: [] };
    });
    connect.mockResolvedValue({
      query: clientQuery,
      release: clientRelease,
    });
    query.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM tenants t') && sql.includes('customer_tenant')) {
        return { rows: [listRow()] };
      }
      if (typeof sql === 'string' && sql.includes('SELECT id FROM users WHERE tenant_id')) {
        return { rows: [{ id: 'user-1' }] };
      }
      if (
        typeof sql === 'string' &&
        sql.includes("account_type = 'customer_tenant'") &&
        sql.includes('partner_id')
      ) {
        return {
          rows: [
            {
              id: 'cust-1',
              plan_id: 'plan-platform-1',
              max_users_override: 5,
              partner_sell_plan_id: null,
            },
          ],
        };
      }
      if (typeof sql === 'string' && sql.includes('COUNT(*)') && sql.includes('FROM users')) {
        return { rows: [{ n: '1' }] };
      }
      if (typeof sql === 'string' && sql.includes('SELECT id, email FROM users WHERE tenant_id')) {
        return { rows: [{ id: 'user-1', email: 'admin@cliente.test' }] };
      }
      return { rows: [] };
    });
  });

  it('createPartnerCustomer cria tenant com seats, login e senha', async () => {
    const row = await createPartnerCustomer('partner-1', {
      company_name: 'Cliente X',
      admin_email: 'admin@cliente.test',
      admin_password: 'SenhaForte1',
      seats: 5,
      sell_plan_id: 'sell-1',
    });

    expect(row.id).toBe('cust-1');
    expect(row.seats_allocated).toBe(5);
    expect(createTenantAdminUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@cliente.test',
        password: 'SenhaForte1',
      }),
      expect.anything()
    );
    expect(clientQuery).toHaveBeenCalledWith('BEGIN');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    const insertCall = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO tenants')
    );
    expect(insertCall?.[1]).toEqual(
      expect.arrayContaining(['Cliente X', expect.any(String), 'plan-platform-1', 'admin@cliente.test'])
    );
    expect(insertCall?.[1]?.[7]).toBe(5);
    expect(insertCall?.[1]?.[8]).toBe('sell-1');
  });

  it('createPartnerCustomer exige sell_plan_id', async () => {
    await expect(
      createPartnerCustomer('partner-1', {
        company_name: 'Cliente Y',
        admin_email: 'y@test.com',
        admin_password: 'SenhaForte1',
        seats: 1,
        sell_plan_id: '',
      })
    ).rejects.toMatchObject({ code: 'SELL_PLAN_REQUIRED' } satisfies Partial<PartnerAdminError>);
  });

  it('createPartnerCustomer rejeita senha curta', async () => {
    await expect(
      createPartnerCustomer('partner-1', {
        company_name: 'Cliente Y',
        admin_email: 'y@test.com',
        admin_password: 'curta',
        seats: 1,
        sell_plan_id: 'sell-1',
      })
    ).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' } satisfies Partial<PartnerAdminError>);
  });

  it('createPartnerCustomer rejeita seats > disponíveis', async () => {
    vi.mocked(getPartnerLicenseSummary).mockResolvedValueOnce({
      partner_tenant_id: 'partner-1',
      purchased_seats: 10,
      used_seats: 9,
      available_seats: 1,
      unit_cost_cents: 1000,
      floor_price_cents: 5000,
      program_type: 'license_pool',
    });

    await expect(
      createPartnerCustomer('partner-1', {
        company_name: 'Cliente Y',
        admin_email: 'y@test.com',
        admin_password: 'SenhaForte1',
        seats: 3,
        sell_plan_id: 'sell-1',
      })
    ).rejects.toMatchObject({ code: 'LICENSE_POOL_EXHAUSTED' } satisfies Partial<PartnerAdminError>);
  });

  it('listPartnerCustomers inclui seats_allocated e admin_email', async () => {
    const items = await listPartnerCustomers('partner-1');
    expect(items[0].seats_allocated).toBe(5);
    expect(items[0].admin_email).toBe('admin@cliente.test');
  });

  it('updatePartnerCustomer faz upgrade de plano e seats', async () => {
    vi.mocked(getPartnerSellPlan).mockResolvedValueOnce({
      id: 'sell-2',
      partner_tenant_id: 'partner-1',
      source_platform_plan_id: 'plan-platform-2',
      name: 'Pro',
      slug: 'pro',
      price_cents: 19900,
      billing_interval: 'monthly',
      features_json: {},
      status: 'active',
      created_at: '2026-08-17',
      updated_at: '2026-08-17',
      trial_days: 0,
    });

    query.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM tenants t') && sql.includes('customer_tenant')) {
        return {
          rows: [
            listRow({
              partner_sell_plan_id: 'sell-2',
              sell_plan_name: 'Pro',
              sell_plan_price_cents: '19900',
              seats_allocated: '8',
              plan_id: 'plan-platform-2',
            }),
          ],
        };
      }
      if (
        typeof sql === 'string' &&
        sql.includes("account_type = 'customer_tenant'") &&
        sql.includes('partner_id')
      ) {
        return {
          rows: [
            {
              id: 'cust-1',
              plan_id: 'plan-platform-1',
              max_users_override: 5,
              partner_sell_plan_id: null,
            },
          ],
        };
      }
      if (typeof sql === 'string' && sql.includes('COUNT(*)') && sql.includes('FROM users')) {
        return { rows: [{ n: '1' }] };
      }
      if (typeof sql === 'string' && sql.includes('SELECT id, email FROM users WHERE tenant_id')) {
        return { rows: [{ id: 'user-1', email: 'admin@cliente.test' }] };
      }
      return { rows: [] };
    });

    const row = await updatePartnerCustomer('partner-1', 'cust-1', {
      seats: 8,
      sell_plan_id: 'sell-2',
      company_name: 'Cliente X Atualizado',
    });

    expect(row.partner_sell_plan_id).toBe('sell-2');
    expect(row.seats_allocated).toBe(8);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    const updateTenant = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE tenants SET') && c[0].includes('partner_sell_plan_id')
    );
    expect(updateTenant).toBeTruthy();
  });

  it('updatePartnerCustomer rejeita seats abaixo dos usuários', async () => {
    query.mockImplementation(async (sql: string) => {
      if (
        typeof sql === 'string' &&
        sql.includes("account_type = 'customer_tenant'") &&
        sql.includes('partner_id')
      ) {
        return {
          rows: [
            {
              id: 'cust-1',
              plan_id: 'plan-platform-1',
              max_users_override: 5,
              partner_sell_plan_id: null,
            },
          ],
        };
      }
      if (typeof sql === 'string' && sql.includes('COUNT(*)') && sql.includes('FROM users')) {
        return { rows: [{ n: '3' }] };
      }
      return { rows: [] };
    });

    await expect(
      updatePartnerCustomer('partner-1', 'cust-1', { seats: 2 })
    ).rejects.toMatchObject({ code: 'SEATS_BELOW_USERS' } satisfies Partial<PartnerAdminError>);
  });

  it('updatePartnerCustomer redefine senha do admin', async () => {
    await updatePartnerCustomer('partner-1', 'cust-1', {
      admin_password: 'NovaSenha99',
    });
    expect(hashPassword).toHaveBeenCalledWith('NovaSenha99');
    const pwdUpdate = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('password_hash')
    );
    expect(pwdUpdate).toBeTruthy();
  });

  it('deletePartnerCustomer remove cliente da carteira', async () => {
    query.mockImplementation(async (sql: string) => {
      if (
        typeof sql === 'string' &&
        sql.includes("account_type = 'customer_tenant'") &&
        sql.includes('partner_id')
      ) {
        return { rows: [{ id: 'cust-1', name: 'Cliente X' }] };
      }
      return { rows: [] };
    });

    await deletePartnerCustomer('partner-1', 'cust-1');
    expect(deleteTenantWithDependencies).toHaveBeenCalledWith('cust-1');
    expect(refreshPartnerUsedSeatsCache).toHaveBeenCalledWith('partner-1');
  });

  it('deletePartnerCustomer rejeita cliente de outro partner', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(deletePartnerCustomer('partner-1', 'cust-x')).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
    } satisfies Partial<PartnerAdminError>);
    expect(deleteTenantWithDependencies).not.toHaveBeenCalled();
  });
});
