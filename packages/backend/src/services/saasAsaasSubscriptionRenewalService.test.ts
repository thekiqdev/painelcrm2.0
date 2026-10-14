import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./invoiceService.js', () => ({
  createInvoice: vi.fn(),
  getInvoiceById: vi.fn(),
  getInvoiceByGatewayReferenceId: vi.fn(),
  updateInvoiceGatewayData: vi.fn().mockResolvedValue(undefined),
  cancelOpenPlanRenewalBillingsForTenant: vi.fn().mockResolvedValue([]),
}));

vi.mock('../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
}));

vi.mock('./saasContractRenewalReconcileService.js', () => ({
  reconcileOpenPlanRenewalsAfterContractChange: vi.fn(),
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
  cancelOpenPlanRenewalBillingsForTenant,
  createInvoice,
  getInvoiceById,
  getInvoiceByGatewayReferenceId,
  updateInvoiceGatewayData,
} from './invoiceService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { reconcileOpenPlanRenewalsAfterContractChange } from './saasContractRenewalReconcileService.js';
import {
  getSubscriptionById,
  updateSubscriptionAfterRenewal,
} from './billingSubscriptionService.js';
import {
  clearSubscriptionPastDueOnPaid,
  markSubscriptionPastDue,
} from './collectionPolicy/subscriptionPastDueWriter.js';
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
    expect(cancelOpenPlanRenewalBillingsForTenant).not.toHaveBeenCalled();
    expect(reconcileOpenPlanRenewalsAfterContractChange).not.toHaveBeenCalled();
  });

  it('não confirma se não for plan_renewal', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(
      billingRow({ status: 'paid', billing_reason: 'plan_purchase' }) as never
    );
    const r = await confirmSaasRenewalFromAsaasPayment(BILLING_ID);
    expect(r).toEqual({ confirmed: false, detail: 'not_plan_renewal' });
  });

  it('fatura velha no backlog reancora a partir do pagamento e cancela a irmã', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(
      billingRow({
        status: 'paid',
        paid_at: '2026-10-14T15:00:00.000Z',
        period_start: '2026-09-29',
        period_end: '2026-10-29',
        due_date: '2026-09-29',
      }) as never
    );
    vi.mocked(getSubscriptionById).mockResolvedValue(subRow({ billing_cycle_count: 2 }) as never);
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      const q = String(sql).replace(/\s+/g, ' ');
      if (q.includes('late_renewal_restart_at')) return { rows: [], rowCount: 0 } as never;
      if (q.includes('plan_period_end')) {
        return {
          rows: [{ plan_period_end: '2026-08-29', asaas_subscription_id: null }],
          rowCount: 1,
        } as never;
      }
      if (q.includes('FROM tenant_billing') && q.includes('status = ANY')) {
        return {
          rows: [{ period_start: '2026-08-29', period_end: '2026-09-29', status: 'overdue' }],
          rowCount: 1,
        } as never;
      }
      return { rows: [], rowCount: 1 } as never;
    });
    const cancelPayment = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getActiveGateway).mockResolvedValue({ cancelPayment } as never);
    vi.mocked(cancelOpenPlanRenewalBillingsForTenant).mockResolvedValue([
      {
        id: 'old-aug',
        amount_cents: 14700,
        gateway: 'asaas',
        gateway_reference_id: 'pay_aug',
        period_start: '2026-08-29',
        period_end: '2026-09-29',
      },
    ]);

    const result = await confirmSaasRenewalFromAsaasPayment(BILLING_ID);

    expect(result).toEqual({ confirmed: true, detail: 'restarted' });
    expect(updateSubscriptionAfterRenewal).toHaveBeenCalledTimes(1);
    expect(updateSubscriptionAfterRenewal).toHaveBeenCalledWith(
      pool,
      SUB_ID,
      TENANT_ID,
      expect.objectContaining({
        current_period_start: '2026-10-14',
        current_period_end: '2026-11-14',
        next_billing_date: '2026-11-14',
        billing_cycle_count: 3,
      })
    );
    const periodUpdate = vi.mocked(pool.query).mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE tenant_billing')
    );
    expect(periodUpdate?.[1]).toEqual(['2026-10-14', '2026-11-14', BILLING_ID, TENANT_ID]);
    expect(cancelOpenPlanRenewalBillingsForTenant).toHaveBeenCalledWith(TENANT_ID, BILLING_ID);
    expect(cancelPayment).toHaveBeenCalledWith('pay_aug');
    expect(clearSubscriptionPastDueOnPaid).toHaveBeenCalled();
    expect(updateInvoiceGatewayData).toHaveBeenCalledWith(
      BILLING_ID,
      expect.objectContaining({
        gateway_metadata: expect.objectContaining({
          late_renewal_restart_at: expect.any(String),
          renewal_period_start: '2026-10-14',
          renewal_period_end: '2026-11-14',
        }),
      })
    );
    expect(reconcileOpenPlanRenewalsAfterContractChange).not.toHaveBeenCalled();
    const renewalArgs = vi.mocked(updateSubscriptionAfterRenewal).mock.calls[0]?.[3] as Record<
      string,
      unknown
    >;
    expect(renewalArgs).not.toHaveProperty('contracted_plan_price_cents');
  });

  it('segunda baixa do mesmo atraso não soma outro mês', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(
      billingRow({
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        status: 'paid',
        paid_at: '2026-10-14T16:00:00.000Z',
        period_start: '2026-08-29',
        period_end: '2026-09-29',
        due_date: '2026-08-29',
      }) as never
    );
    vi.mocked(getSubscriptionById).mockResolvedValue(subRow({ billing_cycle_count: 3 }) as never);
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      const q = String(sql).replace(/\s+/g, ' ');
      if (q.includes('late_renewal_restart_at')) {
        return { rows: [{ renewal_period_start: '2026-10-14' }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 1 } as never;
    });

    const result = await confirmSaasRenewalFromAsaasPayment(
      'ffffffff-ffff-4fff-8fff-ffffffffffff'
    );

    expect(result).toEqual({ confirmed: true, detail: 'restart_already_applied' });
    expect(updateSubscriptionAfterRenewal).not.toHaveBeenCalled();
    expect(
      vi.mocked(pool.query).mock.calls.some(([sql]) => String(sql).includes('plan_period_start'))
    ).toBe(false);
    expect(clearSubscriptionPastDueOnPaid).toHaveBeenCalled();
    expect(updateInvoiceGatewayData).toHaveBeenCalledWith(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      expect.objectContaining({
        gateway_metadata: expect.objectContaining({ late_renewal_restart_skipped: true }),
      })
    );
    expect(reconcileOpenPlanRenewalsAfterContractChange).not.toHaveBeenCalled();
  });

  it('assinatura Asaas com backlog mantém o período da fatura', async () => {
    vi.mocked(getInvoiceById).mockResolvedValue(
      billingRow({
        status: 'paid',
        paid_at: '2026-10-14T15:00:00.000Z',
        period_start: '2026-09-29',
        period_end: '2026-10-29',
        due_date: '2026-09-29',
      }) as never
    );
    vi.mocked(getSubscriptionById).mockResolvedValue(subRow() as never);
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      const q = String(sql).replace(/\s+/g, ' ');
      if (q.includes('late_renewal_restart_at')) return { rows: [], rowCount: 0 } as never;
      if (q.includes('plan_period_end')) {
        return {
          rows: [{ plan_period_end: '2026-08-29', asaas_subscription_id: 'sub_asaas_xyz' }],
          rowCount: 1,
        } as never;
      }
      if (q.includes('FROM tenant_billing') && q.includes('status = ANY')) {
        return {
          rows: [{ period_start: '2026-08-29', period_end: '2026-09-29', status: 'overdue' }],
          rowCount: 1,
        } as never;
      }
      return { rows: [], rowCount: 1 } as never;
    });

    const result = await confirmSaasRenewalFromAsaasPayment(BILLING_ID);

    expect(result).toEqual({ confirmed: true, detail: 'confirmed' });
    expect(updateSubscriptionAfterRenewal).toHaveBeenCalledWith(
      pool,
      SUB_ID,
      TENANT_ID,
      expect.objectContaining({
        current_period_start: '2026-09-29',
        current_period_end: '2026-10-29',
        billing_cycle_count: 3,
      })
    );
    expect(cancelOpenPlanRenewalBillingsForTenant).not.toHaveBeenCalled();
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
