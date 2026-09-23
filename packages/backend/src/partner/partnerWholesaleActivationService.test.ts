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
  withTenantRlsContext: async (_id: string, work: () => Promise<unknown>) => work(),
}));

vi.mock('../services/auditLogService.js', () => ({
  logSuperAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./partnerLicenseLedgerService.js', () => ({
  applyPartnerLicenseDelta: vi.fn().mockResolvedValue({ balanceAfter: 50, ledgerId: 'led-1' }),
}));

vi.mock('./partnerWholesalePlanService.js', () => ({
  getWholesalePlan: vi.fn(),
}));

vi.mock('./partnerRepository.js', () => ({
  getPartnerDetail: vi.fn(),
  resolveDefaultPlanId: vi.fn().mockResolvedValue('envelope-plan'),
}));

vi.mock('../services/invoiceService.js', () => ({
  setBillingSubscriptionId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/billingSubscriptionService.js', () => ({
  createSubscription: vi.fn().mockResolvedValue({ id: 'sub-1' }),
  getActiveSaasSubscriptionByTenant: vi.fn().mockResolvedValue(null),
  getOpenSaasSubscriptionByTenant: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/billingSettingsService.js', () => ({
  getBillingSettings: vi.fn().mockResolvedValue({ grace_period_days: 3 }),
}));

vi.mock('../services/paymentGatewayConfigService.js', () => ({
  getActiveConfig: vi.fn().mockResolvedValue({ gateway_key: 'asaas' }),
}));

import { applyPartnerLicenseDelta } from './partnerLicenseLedgerService.js';
import { getWholesalePlan } from './partnerWholesalePlanService.js';
import { getPartnerDetail } from './partnerRepository.js';
import {
  activatePartnerWholesaleFromBilling,
  assignWholesalePlanGrant,
} from './partnerWholesaleActivationService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WHOLESALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BILLING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ENVELOPE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const plan = {
  id: WHOLESALE_ID,
  name: 'Partner 50',
  slug: 'partner-50',
  description: null,
  status: 'active' as const,
  seats_included: 50,
  price_cents: 99900,
  billing_interval: 'monthly' as const,
  envelope_plan_id: ENVELOPE_ID,
  unit_overage_cents: 2000,
  sort_order: 0,
  metadata: {},
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};

describe('partnerWholesaleActivationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientQuery.mockReset();
    clientRelease.mockReset();
    clientQuery.mockResolvedValue({ rows: [] });
    connect.mockResolvedValue({
      query: clientQuery,
      release: clientRelease,
    });
    query.mockResolvedValue({ rows: [] });
    vi.mocked(getWholesalePlan).mockResolvedValue(plan);
    vi.mocked(getPartnerDetail).mockResolvedValue({
      id: PARTNER_ID,
      purchased_seats: 0,
      plan_id: ENVELOPE_ID,
    } as never);
  });

  it('assignWholesalePlanGrant credita seats e marca wholesale active', async () => {
    const result = await assignWholesalePlanGrant({
      partnerTenantId: PARTNER_ID,
      wholesalePlanId: WHOLESALE_ID,
      actorUserId: 'admin-1',
    });

    expect(result.seatsCredited).toBe(50);
    expect(result.purchased_seats).toBe(50);
    expect(applyPartnerLicenseDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerTenantId: PARTNER_ID,
        deltaSeats: 50,
        reason: 'grant',
        wholesalePlanId: WHOLESALE_ID,
      })
    );
    const sqls = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("wholesale_status = 'active'"))).toBe(true);
    expect(sqls.some((s) => s.includes('UPDATE tenants SET plan_id'))).toBe(true);
  });

  it('activatePartnerWholesaleFromBilling é idempotente por billing_id', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'led-existing' }] });

    await activatePartnerWholesaleFromBilling({
      id: BILLING_ID,
      tenant_id: PARTNER_ID,
      plan_id: ENVELOPE_ID,
      billing_interval: 'monthly',
      amount_cents: 99900,
      due_date: '2026-09-15',
      status: 'paid',
      paid_at: '2026-09-08T12:00:00.000Z',
      invoice_number: 'INV-1',
      gateway: 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: 'pay_1',
      gateway_metadata: { wholesale_plan_id: WHOLESALE_ID },
      gateway_status: 'RECEIVED',
      idempotency_key: null,
      period_start: null,
      period_end: null,
      subscription_id: null,
      plan_name_snapshot: 'Partner 50',
      plan_price_snapshot: 99900,
      users_count: 50,
      source: 'self_service',
      billing_reason: 'partner_wholesale',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    });

    expect(connect).not.toHaveBeenCalled();
    expect(applyPartnerLicenseDelta).not.toHaveBeenCalled();
  });

  it('activatePartnerWholesaleFromBilling credita plan_activate e usa metadata', async () => {
    // ledgerExistsForBilling → empty
    query.mockResolvedValueOnce({ rows: [] });
    // after commit: createSubscription path may call query — already mocked empty

    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM partner_license_ledger')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await activatePartnerWholesaleFromBilling({
      id: BILLING_ID,
      tenant_id: PARTNER_ID,
      plan_id: ENVELOPE_ID,
      billing_interval: 'monthly',
      amount_cents: 99900,
      due_date: '2026-09-15',
      status: 'paid',
      paid_at: '2026-09-08T12:00:00.000Z',
      invoice_number: 'INV-1',
      gateway: 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: 'pay_1',
      gateway_metadata: { wholesale_plan_id: WHOLESALE_ID },
      gateway_status: 'RECEIVED',
      idempotency_key: null,
      period_start: null,
      period_end: null,
      subscription_id: null,
      plan_name_snapshot: 'Partner 50',
      plan_price_snapshot: 99900,
      users_count: 50,
      source: 'self_service',
      billing_reason: 'partner_wholesale',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    });

    expect(applyPartnerLicenseDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'plan_activate',
        deltaSeats: 50,
        billingId: BILLING_ID,
        wholesalePlanId: WHOLESALE_ID,
      })
    );
  });
});
