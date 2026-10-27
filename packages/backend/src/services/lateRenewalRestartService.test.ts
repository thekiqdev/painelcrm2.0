import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('./invoiceService.js', () => ({
  cancelOpenPlanRenewalBillingsForTenant: vi.fn(),
  createInvoice: vi.fn(),
}));

vi.mock('./billingService.js', async () => {
  const actual = await vi.importActual<typeof import('./billingService.js')>('./billingService.js');
  return {
    ...actual,
    calculateSaasRenewalInvoiceAmount: vi.fn(),
    resolveWhatsAppInstanceUnitPriceForRenewal: vi.fn(),
  };
});

vi.mock('../partner/partnerWholesaleRecurringService.js', () => ({
  tryResolveWholesaleRenewalAmount: vi.fn(),
}));

vi.mock('./paymentGatewayConfigService.js', () => ({
  getActiveConfig: vi.fn(),
}));

vi.mock('../modules/payments/gatewayProvider.js', () => ({
  getActiveGateway: vi.fn(),
}));

import { pool } from '../utils/db.js';
import {
  cancelOpenPlanRenewalBillingsForTenant,
  createInvoice,
} from './invoiceService.js';
import {
  calculateSaasRenewalInvoiceAmount,
  resolveWhatsAppInstanceUnitPriceForRenewal,
} from './billingService.js';
import { tryResolveWholesaleRenewalAmount } from '../partner/partnerWholesaleRecurringService.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import {
  assessLateRenewalRestartForTenant,
  restartLateRenewalForTenant,
} from './lateRenewalRestartService.js';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PLAN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NEW_BILLING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const backlog = [
  { period_start: '2026-08-29', period_end: '2026-09-29', status: 'overdue' },
  { period_start: '2026-09-29', period_end: '2026-10-29', status: 'overdue' },
];

function mockReads(opts: {
  planPeriodEnd?: string;
  asaasSubscriptionId?: string | null;
  open?: typeof backlog;
  subscription?: boolean;
}) {
  const open = opts.open ?? backlog;
  vi.mocked(pool.query).mockImplementation(async (sql: string) => {
    const q = sql.replace(/\s+/g, ' ');
    if (q.includes('FROM tenants')) {
      return {
        rows: [
          {
            plan_period_end: opts.planPeriodEnd ?? '2026-08-29',
            max_whatsapp_instances_override: null,
          },
        ],
        rowCount: 1,
      } as never;
    }
    if (q.includes('FROM subscriptions') && q.includes('asaas_subscription_id')) {
      if (opts.subscription === false) return { rows: [], rowCount: 0 } as never;
      return {
        rows: [
          {
            id: SUB,
            plan_id: PLAN,
            billing_interval: 'monthly',
            users_count: 3,
            contracted_plan_price_cents: 14700,
            contracted_price_per_user_cents: null,
            contracted_price_per_instance_cents: null,
            asaas_subscription_id: opts.asaasSubscriptionId ?? null,
          },
        ],
        rowCount: 1,
      } as never;
    }
    if (q.includes('FROM tenant_billing')) {
      return { rows: open, rowCount: open.length } as never;
    }
    if (q.includes('FROM plans')) {
      return {
        rows: [
          {
            name: 'Pro',
            price_cents: 14700,
            plan_type: 'standard',
            max_whatsapp_instances: 1,
          },
        ],
        rowCount: 1,
      } as never;
    }
    if (q.includes('UPDATE subscriptions') && q.includes('next_billing_date')) {
      return { rows: [], rowCount: 1 } as never;
    }
    throw new Error(`query inesperada: ${q}`);
  });
}

describe('restartLateRenewalForTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateSaasRenewalInvoiceAmount).mockResolvedValue({
      amountCents: 14700,
      priceSource: 'contracted_snapshot',
      planPriceSnapshotForInvoice: 14700,
    });
    vi.mocked(resolveWhatsAppInstanceUnitPriceForRenewal).mockResolvedValue(null);
    vi.mocked(tryResolveWholesaleRenewalAmount).mockResolvedValue(null);
    vi.mocked(getActiveConfig).mockResolvedValue({ gateway_key: 'asaas' } as never);
    vi.mocked(createInvoice).mockResolvedValue({
      id: NEW_BILLING,
      invoice_number: 'INV-NEW',
    } as never);
    vi.mocked(cancelOpenPlanRenewalBillingsForTenant).mockResolvedValue([
      {
        id: 'old-aug',
        amount_cents: 14700,
        gateway: 'asaas',
        gateway_reference_id: 'pay_aug',
        period_start: '2026-08-29',
        period_end: '2026-09-29',
      },
      {
        id: 'old-sep',
        amount_cents: 14700,
        gateway: 'asaas',
        gateway_reference_id: 'pay_sep',
        period_start: '2026-09-29',
        period_end: '2026-10-29',
      },
    ]);
    vi.mocked(getActiveGateway).mockResolvedValue({
      cancelPayment: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it('cria um ciclo 14/10–14/11, cancela as abertas e move a próxima cobrança', async () => {
    mockReads({});
    const result = await restartLateRenewalForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });

    expect(result).toEqual({
      ok: true,
      billingId: NEW_BILLING,
      invoiceNumber: 'INV-NEW',
      periodStart: '2026-10-14',
      periodEnd: '2026-11-14',
      amountCents: 14700,
      cancelledIds: ['old-aug', 'old-sep'],
    });
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT,
        plan_id: PLAN,
        billing_reason: 'plan_renewal',
        amount_cents: 14700,
        due_date: '2026-10-14',
        period_start: '2026-10-14',
        period_end: '2026-11-14',
        subscription_id: SUB,
        users_count: 3,
      })
    );
    expect(cancelOpenPlanRenewalBillingsForTenant).toHaveBeenCalledWith(TENANT, NEW_BILLING);

    const updateCall = vi.mocked(pool.query).mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE subscriptions')
    );
    expect(updateCall?.[0]).toEqual(expect.stringContaining('billing_anchor_day = EXTRACT(DAY FROM $1::date)'));
    expect(updateCall?.[1]).toEqual(['2026-11-14', SUB, TENANT]);
    expect(String(updateCall?.[0])).not.toMatch(/contracted_|activated_billing_id|billing_cycle_count/);

    const gateway = await getActiveGateway({ billingType: 'saas', tenantId: TENANT });
    expect(gateway?.cancelPayment).toHaveBeenCalledWith('pay_aug');
    expect(gateway?.cancelPayment).toHaveBeenCalledWith('pay_sep');
  });

  it('falha de gateway não desfaz o restart', async () => {
    mockReads({});
    vi.mocked(getActiveGateway).mockResolvedValue({
      cancelPayment: vi.fn().mockRejectedValue(new Error('asaas down')),
    } as never);

    const result = await restartLateRenewalForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });
    expect(result.ok).toBe(true);
    expect(cancelOpenPlanRenewalBillingsForTenant).toHaveBeenCalledTimes(1);
  });

  it('atacado substitui o valor, sem somar os meses atrasados', async () => {
    mockReads({});
    vi.mocked(tryResolveWholesaleRenewalAmount).mockResolvedValue({
      amountCents: 9900,
      extraSeats: 1,
      planPriceCents: 8000,
    });

    const result = await restartLateRenewalForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });
    expect(result.ok && result.amountCents).toBe(9900);
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ amount_cents: 9900 })
    );
  });

  it('recusa vigência ainda aberta sem cancelar nem criar', async () => {
    mockReads({ planPeriodEnd: '2026-10-29' });
    const result = await restartLateRenewalForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });
    expect(result).toEqual({ ok: false, error: 'plan_period_not_ended' });
    expect(createInvoice).not.toHaveBeenCalled();
    expect(cancelOpenPlanRenewalBillingsForTenant).not.toHaveBeenCalled();
    expect(
      vi.mocked(pool.query).mock.calls.some(([sql]) => String(sql).includes('UPDATE subscriptions'))
    ).toBe(false);
  });

  it('recusa assinatura Asaas sem cancelar nem criar', async () => {
    mockReads({ asaasSubscriptionId: 'sub_asaas_xyz' });
    const result = await restartLateRenewalForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });
    expect(result).toEqual({ ok: false, error: 'asaas_subscription' });
    expect(createInvoice).not.toHaveBeenCalled();
    expect(cancelOpenPlanRenewalBillingsForTenant).not.toHaveBeenCalled();
  });

  it('segundo clique não cria outra fatura nem cancela a que acabou de nascer', async () => {
    mockReads({});
    const first = await restartLateRenewalForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });
    expect(first.ok).toBe(true);

    mockReads({
      open: [
        {
          period_start: '2026-10-14',
          period_end: '2026-11-14',
          status: 'pending',
        },
      ],
    });
    const second = await restartLateRenewalForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });
    expect(second).toEqual({ ok: false, error: 'insufficient_backlog' });
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(cancelOpenPlanRenewalBillingsForTenant).toHaveBeenCalledTimes(1);
  });

  it('sem assinatura não escreve', async () => {
    mockReads({ subscription: false });
    const result = await restartLateRenewalForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });
    expect(result).toEqual({ ok: false, error: 'subscription_not_found' });
    expect(createInvoice).not.toHaveBeenCalled();
    expect(cancelOpenPlanRenewalBillingsForTenant).not.toHaveBeenCalled();
  });

  it('assess só lê: elegível no caso da tela e não cria fatura', async () => {
    mockReads({});
    const assessment = await assessLateRenewalRestartForTenant({
      tenantId: TENANT,
      paymentDate: '2026-10-14',
    });
    expect(assessment).toEqual({
      eligible: true,
      periodStart: '2026-10-14',
      periodEnd: '2026-11-14',
      openRenewalCount: 2,
    });
    expect(createInvoice).not.toHaveBeenCalled();
    expect(cancelOpenPlanRenewalBillingsForTenant).not.toHaveBeenCalled();
  });
});
