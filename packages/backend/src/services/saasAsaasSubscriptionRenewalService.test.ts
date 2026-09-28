import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./invoiceService.js', () => ({
  createInvoice: vi.fn(),
  getInvoiceById: vi.fn(),
  getInvoiceByGatewayReferenceId: vi.fn(),
  updateInvoiceGatewayData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./billingSubscriptionService.js', () => ({
  getSubscriptionById: vi.fn(),
  updateSubscriptionAfterRenewal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./billingLogger.js', () => ({
  billingLog: vi.fn(),
}));

vi.mock('../partner/partnerWholesaleRenewalService.js', () => ({
  maybeConfirmPartnerWholesaleRenewal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./collectionPolicy/subscriptionPastDueWriter.js', () => ({
  clearSubscriptionPastDueOnPaid: vi.fn().mockResolvedValue(undefined),
  markSubscriptionPastDue: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

vi.mock('./billing2/billingCorrelationId.js', () => ({
  tenantBillingCorrelationId: vi.fn((id: string) => `corr:${id}`),
}));

import { pool } from '../utils/db.js';
import {
  createInvoice,
  getInvoiceById,
  getInvoiceByGatewayReferenceId,
  updateInvoiceGatewayData,
} from './invoiceService.js';
import {
  getSubscriptionById,
  updateSubscriptionAfterRenewal,
} from './billingSubscriptionService.js';
import { markSubscriptionPastDue } from './collectionPolicy/subscriptionPastDueWriter.js';
import {
  confirmSaasRenewalFromAsaasPayment,
  ensureTenantBillingForAsaasSubscriptionPayment,
  markAsaasSubscriptionPaymentFailed,
} from './saasAsaasSubscriptionRenewalService.js';

const SUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BILLING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASAAS_SUB = 'sub_asaas_xyz';

function subRow(over: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    type: 'saas',
    tenant_id: TENANT_ID,
    customer_id: null,
    plan_id: 'plan-1',
    amount_cents: 50000,
    currency: 'BRL',
    billing_anchor_day: 28,
    billing_cycle_count: 2,
    billing_interval: 'monthly',
    status: 'active',
    next_billing_date: '2026-09-28',
    current_period_start: '2026-08-28',
    current_period_end: '2026-09-28',
    cancel_at_period_end: false,
    grace_period_days: 3,
    default_payment_method: 'CREDIT_CARD',
    users_count: 5,
    gateway: 'asaas',
    last_job_at: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    cycles_unlimited: true,
    max_cycles: null,
    ...over,
  };
}

function billingRow(over: Record<string, unknown> = {}) {
  return {
    id: BILLING_ID,
    tenant_id: TENANT_ID,
    plan_id: 'plan-1',
    billing_interval: 'monthly',
    amount_cents: 50000,
    due_date: '2026-09-28',
    status: 'pending',
    paid_at: null,
    invoice_number: 'INV-1',
    gateway: 'asaas',
    payment_method: 'CREDIT_CARD',
    gateway_reference_id: null,
    gateway_metadata: {},
    gateway_status: null,
    idempotency_key: null,
    period_start: '2026-09-28',
    period_end: '2026-10-28',
    subscription_id: SUB_ID,
    plan_name_snapshot: null,
    plan_price_snapshot: 50000,
    users_count: 5,
    source: 'self_service',
    billing_reason: 'plan_renewal',
    created_at: '',
    updated_at: '',
    ...over,
  };
}

describe('ensureTenantBillingForAsaasSubscriptionPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reusa billing já ligado ao pay_id', async () => {
    const existing = billingRow({ gateway_reference_id: 'pay_1', status: 'pending' });
    vi.mocked(getInvoiceByGatewayReferenceId).mockResolvedValue(existing as never);
    vi.mocked(getInvoiceById).mockResolvedValue(existing as never);

    const r = await ensureTenantBillingForAsaasSubscriptionPayment({
      asaasSubscriptionId: ASAAS_SUB,
      paymentId: 'pay_1',
    });
    expect(r?.id).toBe(BILLING_ID);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('liga pay_ à contratação via externalReference (billingId)', async () => {
    vi.mocked(getInvoiceByGatewayReferenceId).mockResolvedValue(null);
    const purchase = billingRow({
      billing_reason: 'plan_purchase',
      gateway_metadata: {},
    });
    vi.mocked(getInvoiceById).mockResolvedValue(purchase as never);

    const r = await ensureTenantBillingForAsaasSubscriptionPayment({
      asaasSubscriptionId: ASAAS_SUB,
      paymentId: 'pay_first',
      externalReference: BILLING_ID,
      gatewayStatus: 'CONFIRMED',
    });

    expect(r?.id).toBe(BILLING_ID);
    expect(updateInvoiceGatewayData).toHaveBeenCalledWith(
      BILLING_ID,
      expect.objectContaining({
        gateway_reference_id: 'pay_first',
        gateway_metadata: expect.objectContaining({ asaas_subscription_id: ASAAS_SUB }),
      })
    );
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('cria plan_renewal quando Assinatura local existe e não há fatura aberta', async () => {
    vi.mocked(getInvoiceByGatewayReferenceId).mockResolvedValue(null);
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: SUB_ID }] } as never) // find by asaas_subscription_id
      .mockResolvedValueOnce({ rows: [] } as never) // open contract
      .mockResolvedValueOnce({ rows: [] } as never); // open renewal
    vi.mocked(getSubscriptionById).mockResolvedValue(subRow() as never);
    const created = billingRow({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
    vi.mocked(createInvoice).mockResolvedValue(created as never);
    vi.mocked(getInvoiceById).mockResolvedValue(created as never);

    const r = await ensureTenantBillingForAsaasSubscriptionPayment({
      asaasSubscriptionId: ASAAS_SUB,
      paymentId: 'pay_cycle_2',
      amountCents: 50000,
      dueDate: '2026-09-28',
      paymentMethod: 'CREDIT_CARD',
      gatewayStatus: 'PENDING',
    });

    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_reason: 'plan_renewal',
        tenant_id: TENANT_ID,
        subscription_id: SUB_ID,
        amount_cents: 50000,
        period_start: '2026-09-28',
      })
    );
    expect(r?.id).toBe(created.id);
  });
});

describe('confirmSaasRenewalFromAsaasPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 1 } as never);
  });

  it('avança período sem tratar como 1ª compra e é idempotente', async () => {
    const paid = billingRow({
      status: 'paid',
      gateway_metadata: { asaas_subscription_id: ASAAS_SUB },
    });
    vi.mocked(getInvoiceById).mockResolvedValue(paid as never);
    vi.mocked(getSubscriptionById).mockResolvedValue(subRow() as never);

    const first = await confirmSaasRenewalFromAsaasPayment(BILLING_ID);
    expect(first.confirmed).toBe(true);
    expect(updateSubscriptionAfterRenewal).toHaveBeenCalledWith(
      pool,
      SUB_ID,
      TENANT_ID,
      expect.objectContaining({
        current_period_start: '2026-09-28',
        current_period_end: '2026-10-28',
        billing_cycle_count: 3,
      })
    );
    expect(updateInvoiceGatewayData).toHaveBeenCalledWith(
      BILLING_ID,
      expect.objectContaining({
        gateway_metadata: expect.objectContaining({
          asaas_renewal_confirmed_at: expect.any(String),
        }),
      })
    );

    vi.mocked(getInvoiceById).mockResolvedValue(
      billingRow({
        status: 'paid',
        gateway_metadata: {
          asaas_subscription_id: ASAAS_SUB,
          asaas_renewal_confirmed_at: '2026-09-28T12:00:00.000Z',
        },
      }) as never
    );
    vi.mocked(updateSubscriptionAfterRenewal).mockClear();
    const second = await confirmSaasRenewalFromAsaasPayment(BILLING_ID);
    expect(second).toEqual({ confirmed: true, detail: 'already_confirmed' });
    expect(updateSubscriptionAfterRenewal).not.toHaveBeenCalled();
  });

  it('não confirma se não for plan_renewal', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(
      billingRow({ status: 'paid', billing_reason: 'plan_purchase' }) as never
    );
    const r = await confirmSaasRenewalFromAsaasPayment(BILLING_ID);
    expect(r).toEqual({ confirmed: false, detail: 'not_plan_renewal' });
  });
});

describe('markAsaasSubscriptionPaymentFailed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marca metadata de recusa e past_due sem exigir grace', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(
      billingRow({
        gateway_metadata: { asaas_subscription_id: ASAAS_SUB },
      }) as never
    );

    await markAsaasSubscriptionPaymentFailed({
      billingId: BILLING_ID,
      gatewayStatus: 'PENDING',
      eventType: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
    });

    expect(updateInvoiceGatewayData).toHaveBeenCalledWith(
      BILLING_ID,
      expect.objectContaining({
        gateway_metadata: expect.objectContaining({
          card_capture_refused: true,
          last_card_failure_event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
        }),
      })
    );
    expect(markSubscriptionPastDue).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: SUB_ID,
        skipEligibilityCheck: true,
        reason: 'asaas_credit_card_capture_refused',
      })
    );
  });
});
