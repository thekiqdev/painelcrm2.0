import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import { calculateInvoiceAmount } from '../services/billingService.js';
import { resolveTenantCommercialPrice } from './tenantCommercialOverrideService.js';
import {
  applySubscriptionCommercialMetadataFromPaidBilling,
  resolveCommercialMetadataFromPaidBilling,
} from './subscriptionCommercialMetadata.js';
import type { TenantBillingRow } from '../services/invoiceService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../services/billingService.js', () => ({
  calculateInvoiceAmount: vi.fn(),
}));

vi.mock('./tenantCommercialOverrideService.js', () => ({
  resolveTenantCommercialPrice: vi.fn(),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const BILLING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBSCRIPTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OVERRIDE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function baseBilling(overrides: Partial<TenantBillingRow> = {}): TenantBillingRow {
  return {
    id: BILLING_ID,
    tenant_id: TENANT_ID,
    plan_id: PLAN_ID,
    billing_interval: 'monthly',
    amount_cents: 9900,
    status: 'paid',
    due_date: '2026-05-24',
    invoice_number: 'INV-TEST',
    gateway: 'asaas',
    payment_method: null,
    gateway_reference_id: null,
    gateway_metadata: null,
    gateway_status: null,
    idempotency_key: null,
    created_at: new Date().toISOString(),
    users_count: null,
    billing_reason: 'plan_purchase',
    subscription_id: null,
    period_start: null,
    period_end: null,
    ...overrides,
  } as TenantBillingRow;
}

describe('subscriptionCommercialMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateInvoiceAmount).mockResolvedValue(9900);
    vi.mocked(pool.query).mockResolvedValue({ rowCount: 1, rows: [] } as never);
  });

  it('waive — commercial_source waive e activation_type zero_amount', async () => {
    vi.mocked(resolveTenantCommercialPrice).mockResolvedValue({
      finalAmountCents: 0,
      source: 'tenant_override',
      overrideId: OVERRIDE_ID,
      overrideType: 'waive',
    });

    const metadata = await resolveCommercialMetadataFromPaidBilling(
      baseBilling({ amount_cents: 0, gateway_metadata: { settlement_source: 'zero_amount' } }),
    );

    expect(metadata.commercial_source).toBe('waive');
    expect(metadata.activation_type).toBe('zero_amount');
    expect(metadata.override_id).toBe(OVERRIDE_ID);
    expect(metadata.billing_id).toBe(BILLING_ID);
  });

  it('ativação normal — commercial_source catalog', async () => {
    vi.mocked(resolveTenantCommercialPrice).mockResolvedValue({
      finalAmountCents: 9900,
      source: 'catalog',
      overrideId: null,
      overrideType: null,
    });

    const metadata = await resolveCommercialMetadataFromPaidBilling(baseBilling());

    expect(metadata.commercial_source).toBe('catalog');
    expect(metadata.activation_type).toBe('paid');
    expect(metadata.override_id).toBeNull();
  });

  it('override fixo — commercial_source tenant_override', async () => {
    vi.mocked(resolveTenantCommercialPrice).mockResolvedValue({
      finalAmountCents: 5900,
      source: 'tenant_override',
      overrideId: OVERRIDE_ID,
      overrideType: 'fixed_price',
    });

    const metadata = await resolveCommercialMetadataFromPaidBilling(
      baseBilling({ amount_cents: 5900 }),
    );

    expect(metadata.commercial_source).toBe('tenant_override');
    expect(metadata.activation_type).toBe('paid');
    expect(metadata.override_type).toBe('fixed_price');
  });

  it('persiste em subscriptions.metadata', async () => {
    vi.mocked(resolveTenantCommercialPrice).mockResolvedValue({
      finalAmountCents: 0,
      source: 'tenant_override',
      overrideId: OVERRIDE_ID,
      overrideType: 'waive',
    });

    await applySubscriptionCommercialMetadataFromPaidBilling({
      subscriptionId: SUBSCRIPTION_ID,
      tenantId: TENANT_ID,
      billing: baseBilling({ amount_cents: 0 }),
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE subscriptions'),
      expect.arrayContaining([
        expect.stringContaining('"commercial_source":"waive"'),
        SUBSCRIPTION_ID,
        TENANT_ID,
      ]),
    );
  });
});
