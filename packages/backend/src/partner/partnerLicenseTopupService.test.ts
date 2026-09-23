import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../utils/db.js', () => ({
  pool: { query: (...args: unknown[]) => query(...args) },
}));

vi.mock('./partnerRepository.js', () => ({
  getPartnerDetail: vi.fn(),
  resolveDefaultPlanId: vi.fn().mockResolvedValue('plan-default'),
}));

vi.mock('./partnerWholesalePlanService.js', () => ({
  getWholesalePlan: vi.fn(),
}));

vi.mock('./partnerLicenseLedgerService.js', () => ({
  applyPartnerLicenseDelta: vi.fn().mockResolvedValue({ balanceAfter: 15, ledgerId: 'led-1' }),
}));

vi.mock('../services/invoiceService.js', () => ({
  createInvoice: vi.fn(),
  getInvoiceById: vi.fn(),
}));

vi.mock('../services/paymentGatewayConfigService.js', () => ({
  getActiveConfig: vi.fn().mockResolvedValue({ gateway_key: 'asaas' }),
}));

vi.mock('../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/tenantBillingPaymentAttemptsService.js', () => ({
  hasTenantBillingPaymentAttemptsTable: vi.fn().mockResolvedValue(false),
}));

vi.mock('../services/saasPlanCheckoutPaymentAttemptService.js', () => ({
  ensureSaasPlanCheckoutPaymentAttemptForSwitch: vi.fn(),
}));

vi.mock('../commercial/zeroAmountSettlementService.js', () => ({
  trySettleZeroAmountBillingIfEligible: vi.fn().mockResolvedValue(null),
}));

import { getPartnerDetail } from './partnerRepository.js';
import { getWholesalePlan } from './partnerWholesalePlanService.js';
import { applyPartnerLicenseDelta } from './partnerLicenseLedgerService.js';
import {
  activatePartnerLicenseTopupFromBilling,
  createPartnerLicenseTopupCheckout,
  quotePartnerLicenseTopup,
} from './partnerLicenseTopupService.js';
import { createInvoice, getInvoiceById } from '../services/invoiceService.js';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WHOLESALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BILLING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('partnerLicenseTopupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [] });
    vi.mocked(getPartnerDetail).mockResolvedValue({
      id: PARTNER_ID,
      plan_id: 'plan-1',
      purchased_seats: 10,
      unit_cost_cents: 5000,
      wholesale_plan_id: WHOLESALE_ID,
      wholesale_status: 'active',
    } as never);
    vi.mocked(getWholesalePlan).mockResolvedValue({
      id: WHOLESALE_ID,
      unit_overage_cents: 3000,
      envelope_plan_id: 'env-1',
      status: 'active',
    } as never);
  });

  it('quote usa unit_overage do plano atacado', async () => {
    const q = await quotePartnerLicenseTopup(PARTNER_ID, { qty: 10 });
    expect(q.qty).toBe(10);
    expect(q.unit_price_cents).toBe(3000);
    expect(q.amount_cents).toBe(30000);
    expect(q.price_source).toBe('wholesale_overage');
  });

  it('quote aceita pack_id', async () => {
    const q = await quotePartnerLicenseTopup(PARTNER_ID, { pack_id: '50' });
    expect(q.qty).toBe(50);
    expect(q.amount_cents).toBe(150000);
  });

  it('createPartnerLicenseTopupCheckout cria fatura partner_license_topup', async () => {
    const billing = {
      id: BILLING_ID,
      tenant_id: PARTNER_ID,
      amount_cents: 30000,
      status: 'pending',
      billing_reason: 'partner_license_topup',
      invoice_number: 'INV-1',
      due_date: '2026-09-15',
      gateway_metadata: {},
    };
    vi.mocked(createInvoice).mockResolvedValue(billing as never);
    vi.mocked(getInvoiceById).mockResolvedValue(billing as never);

    const result = await createPartnerLicenseTopupCheckout({
      partnerTenantId: PARTNER_ID,
      qty: 10,
      paymentMethod: 'PIX',
    });

    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_reason: 'partner_license_topup',
        amount_cents: 30000,
        users_count: 10,
        tenant_id: PARTNER_ID,
      })
    );
    expect(result.quote.qty).toBe(10);
    expect(result.billing.id).toBe(BILLING_ID);
  });

  it('bloqueia compra se past_due', async () => {
    vi.mocked(getPartnerDetail).mockResolvedValue({
      id: PARTNER_ID,
      plan_id: 'plan-1',
      purchased_seats: 10,
      unit_cost_cents: 5000,
      wholesale_plan_id: WHOLESALE_ID,
      wholesale_status: 'past_due',
    } as never);

    await expect(
      createPartnerLicenseTopupCheckout({ partnerTenantId: PARTNER_ID, qty: 5 })
    ).rejects.toMatchObject({ code: 'WHOLESALE_PAST_DUE' });
  });

  it('activatePartnerLicenseTopupFromBilling credita topup_purchase', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // idempotency check

    await activatePartnerLicenseTopupFromBilling({
      id: BILLING_ID,
      tenant_id: PARTNER_ID,
      plan_id: 'plan-1',
      billing_interval: 'monthly',
      amount_cents: 30000,
      due_date: '2026-09-15',
      status: 'paid',
      paid_at: '2026-09-08T12:00:00.000Z',
      invoice_number: 'INV-1',
      gateway: 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: 'pay_1',
      gateway_metadata: {
        topup_seats: 10,
        unit_price_cents: 3000,
        wholesale_plan_id: WHOLESALE_ID,
      },
      gateway_status: 'RECEIVED',
      idempotency_key: null,
      period_start: null,
      period_end: null,
      subscription_id: null,
      plan_name_snapshot: null,
      plan_price_snapshot: null,
      users_count: 10,
      source: 'self_service',
      billing_reason: 'partner_license_topup',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    });

    expect(applyPartnerLicenseDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerTenantId: PARTNER_ID,
        deltaSeats: 10,
        reason: 'topup_purchase',
        billingId: BILLING_ID,
        wholesalePlanId: WHOLESALE_ID,
      })
    );
  });

  it('activate é idempotente por billing_id', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'led-existing' }] });

    await activatePartnerLicenseTopupFromBilling({
      id: BILLING_ID,
      tenant_id: PARTNER_ID,
      plan_id: 'plan-1',
      billing_interval: 'monthly',
      amount_cents: 30000,
      due_date: '2026-09-15',
      status: 'paid',
      paid_at: null,
      invoice_number: 'INV-1',
      gateway: 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: null,
      gateway_metadata: { topup_seats: 10 },
      gateway_status: null,
      idempotency_key: null,
      period_start: null,
      period_end: null,
      subscription_id: null,
      plan_name_snapshot: null,
      plan_price_snapshot: null,
      users_count: 10,
      source: 'self_service',
      billing_reason: 'partner_license_topup',
      created_at: '2026-09-08T00:00:00.000Z',
      updated_at: '2026-09-08T00:00:00.000Z',
    });

    expect(applyPartnerLicenseDelta).not.toHaveBeenCalled();
  });
});
