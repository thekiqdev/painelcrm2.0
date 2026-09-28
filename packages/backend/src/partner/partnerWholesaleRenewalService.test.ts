import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

vi.mock('../services/collectionPolicy/subscriptionPastDueWriter.js', () => ({
  isSubscriptionPastDueEligible: vi.fn().mockResolvedValue(true),
}));

vi.mock('../services/collectionPolicy/billingAuditEventWriter.js', () => ({
  writeBillingAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./partnerWholesalePastDueNotifyService.js', () => ({
  notifyPartnerWholesalePastDue: vi.fn().mockResolvedValue({ sent: false }),
}));

vi.mock('./partnerWholesaleBlockSettingsService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./partnerWholesaleBlockSettingsService.js')>();
  return {
    ...actual,
    isPartnerWholesaleBlockEligible: vi.fn().mockResolvedValue(true),
    getPartnerWholesaleBlockAfterDays: vi.fn().mockResolvedValue(3),
    resolveWholesaleBlockAfterDaysForSubscription: vi.fn().mockResolvedValue({
      days: 3,
      source: 'global',
      partnerTenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      override_days: null,
    }),
  };
});

import {
  assertPartnerChannelGrowthAllowed,
  markPartnerWholesalePastDueBySubscription,
  clearPartnerWholesalePastDueBySubscription,
} from './partnerWholesaleStatusService.js';
import { maybeConfirmPartnerWholesaleRenewal } from './partnerWholesaleRenewalService.js';
import { isPartnerWholesaleBlockEligible } from './partnerWholesaleBlockSettingsService.js';
import { writeBillingAuditEvent } from '../services/collectionPolicy/billingAuditEventWriter.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BILLING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('partnerWholesaleStatusService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assertPartnerChannelGrowthAllowed bloqueia past_due', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          wholesale_status: 'past_due',
          wholesale_subscription_id: SUB_ID,
          wholesale_plan_id: WP_ID,
        },
      ],
    });

    await expect(assertPartnerChannelGrowthAllowed(PARTNER_ID)).rejects.toMatchObject({
      code: 'WHOLESALE_CHANNEL_FROZEN',
    });
  });

  it('assertPartnerChannelGrowthAllowed permite active', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          wholesale_status: 'active',
          wholesale_subscription_id: SUB_ID,
          wholesale_plan_id: WP_ID,
        },
      ],
    });

    await expect(assertPartnerChannelGrowthAllowed(PARTNER_ID)).resolves.toBeUndefined();
  });

  it('markPartnerWholesalePastDueBySubscription atualiza status', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: PARTNER_ID }] })
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: PARTNER_ID }], rowCount: 1 });

    const r = await markPartnerWholesalePastDueBySubscription(SUB_ID, { force: true });
    expect(r.updated).toBe(true);
    expect(r.partnerTenantId).toBe(PARTNER_ID);
    expect(isPartnerWholesaleBlockEligible).not.toHaveBeenCalled();
    expect(writeBillingAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'partner_wholesale.past_due' })
    );
  });

  it('clearPartnerWholesalePastDueBySubscription volta active', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: PARTNER_ID }] })
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: PARTNER_ID }], rowCount: 1 });

    const r = await clearPartnerWholesalePastDueBySubscription(SUB_ID);
    expect(r.updated).toBe(true);
    expect(writeBillingAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'partner_wholesale.past_due_cleared' })
    );
  });
});

describe('maybeConfirmPartnerWholesaleRenewal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não recredita seats — ledger plan_renewal delta 0', async () => {
    query
      // link partner
      .mockResolvedValueOnce({
        rows: [
          {
            partner_tenant_id: PARTNER_ID,
            wholesale_plan_id: WP_ID,
            seats_included: 50,
          },
        ],
      })
      // dup check
      .mockResolvedValueOnce({ rows: [] })
      // balance
      .mockResolvedValueOnce({ rows: [{ purchased_seats: 60 }] })
      // insert ledger
      .mockResolvedValueOnce({ rows: [] })
      // update profile
      .mockResolvedValueOnce({ rows: [] });

    const r = await maybeConfirmPartnerWholesaleRenewal({
      id: BILLING_ID,
      tenant_id: PARTNER_ID,
      plan_id: 'plan-1',
      billing_interval: 'monthly',
      amount_cents: 99900,
      due_date: '2026-10-08',
      status: 'paid',
      paid_at: '2026-09-08T12:00:00.000Z',
      invoice_number: 'INV-R1',
      gateway: 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: 'pay_r',
      gateway_metadata: {},
      gateway_status: 'RECEIVED',
      idempotency_key: null,
      period_start: '2026-09-08',
      period_end: '2026-10-08',
      subscription_id: SUB_ID,
      plan_name_snapshot: null,
      plan_price_snapshot: null,
      users_count: 50,
      source: 'api',
      billing_reason: 'plan_renewal',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    });

    expect(r.handled).toBe(true);
    const insertCall = query.mock.calls.find(
      (c) => typeof c[0] === 'string' && String(c[0]).includes('INSERT INTO partner_license_ledger')
    );
    expect(String(insertCall?.[0])).toMatch(/VALUES \(\$1, 0, \$2,/);
    expect(insertCall?.[1]?.[1]).toBe(60); // balance_after preserved (incl. topups)
  });

  it('idempotente se já existe plan_renewal no ledger', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ partner_tenant_id: PARTNER_ID, wholesale_plan_id: WP_ID, seats_included: 50 }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'led-1' }] })
      // clear past due lookup
      .mockResolvedValueOnce({ rows: [{ partner_tenant_id: PARTNER_ID }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const r = await maybeConfirmPartnerWholesaleRenewal({
      id: BILLING_ID,
      tenant_id: PARTNER_ID,
      plan_id: 'plan-1',
      billing_interval: 'monthly',
      amount_cents: 99900,
      due_date: '2026-10-08',
      status: 'paid',
      paid_at: null,
      invoice_number: null,
      gateway: null,
      payment_method: null,
      gateway_reference_id: null,
      gateway_metadata: {},
      gateway_status: null,
      idempotency_key: null,
      period_start: null,
      period_end: null,
      subscription_id: SUB_ID,
      plan_name_snapshot: null,
      plan_price_snapshot: null,
      users_count: null,
      source: null,
      billing_reason: 'plan_renewal',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    });

    expect(r.handled).toBe(true);
    const inserts = query.mock.calls.filter(
      (c) => typeof c[0] === 'string' && String(c[0]).includes('INSERT INTO partner_license_ledger')
    );
    expect(inserts).toHaveLength(0);
  });
});
