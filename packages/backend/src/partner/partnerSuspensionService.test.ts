import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../services/auditLogService.js', () => ({
  logSuperAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./partnerRepository.js', () => ({
  getPartnerDetail: vi.fn(),
}));

import { pool } from '../utils/db.js';
import { getPartnerDetail } from './partnerRepository.js';
import {
  getPartnerChannelStats,
  suspendPartnerAndMigrateCustomers,
} from './partnerSuspensionService.js';
import { PartnerAdminError } from './partnerAdminService.js';

describe('partnerSuspensionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPartnerChannelStats mapeia contadores', async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [
        {
          partners_active: '2',
          partners_suspended: '1',
          customer_tenants: '10',
          platform_customers: '100',
          migrated_from_channel: '3',
          seats_purchased_total: '50',
          seats_used_total: '12',
        },
      ],
    } as never);

    const stats = await getPartnerChannelStats();
    expect(stats.partners_active).toBe(2);
    expect(stats.customer_tenants).toBe(10);
    expect(stats.migrated_from_channel).toBe(3);
  });

  it('suspendPartnerAndMigrateCustomers 404 se partner inexistente', async () => {
    vi.mocked(getPartnerDetail).mockResolvedValue(null);
    await expect(suspendPartnerAndMigrateCustomers('p1')).rejects.toBeInstanceOf(PartnerAdminError);
  });

  it('suspendPartnerAndMigrateCustomers migra customer_tenant e preserva preço', async () => {
    vi.mocked(getPartnerDetail).mockResolvedValue({
      id: 'partner-1',
      public_name: 'Revenda X',
      partner_status: 'active',
    } as never);

    const clientQuery = vi.fn();
    const client = {
      query: clientQuery,
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    // BEGIN
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // prior migrated count
    clientQuery.mockResolvedValueOnce({ rows: [{ c: '1' }] });
    // customers FOR UPDATE
    clientQuery.mockResolvedValueOnce({
      rows: [{ id: 'cust-1', plan_id: 'plan-1', account_type: 'customer_tenant' }],
    });
    // resolve price: subscription
    clientQuery.mockResolvedValueOnce({
      rows: [{ amount_cents: 9900, contracted_plan_price_cents: 9900, billing_interval: 'monthly' }],
    });
    // deactivate old overrides
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // insert override
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // update subscriptions snapshot
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // update tenant → platform_customer
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // suspend profile
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // archive sell plans
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // domain pending
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // insert event
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'evt-1' }] });
    // COMMIT
    clientQuery.mockResolvedValueOnce({ rows: [] });

    const result = await suspendPartnerAndMigrateCustomers('partner-1', {
      actorUserId: 'admin-1',
      reason: 'teste',
    });

    expect(result.customers_migrated).toBe(1);
    expect(result.customers_skipped).toBe(1);
    expect(result.price_overrides_created).toBe(1);
    expect(result.migrated_tenant_ids).toEqual(['cust-1']);
    expect(client.release).toHaveBeenCalled();

    const tenantUpdate = clientQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("account_type = 'platform_customer'")
    );
    expect(tenantUpdate).toBeTruthy();
  });
});
