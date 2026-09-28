/**
 * CS S2 — após mudança contratual paga, cancela renovações abertas obsoletas e
 * recria a próxima fatura `plan_renewal` no valor contratado (sem charge no gateway).
 */
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import {
  cancelOpenPlanRenewalBillingsForTenant,
  createInvoice,
  findInvoiceBySubscriptionAndPeriod,
  type CancelledOpenPlanRenewalRow,
} from './invoiceService.js';
import type { BillingInterval } from './billingService.js';

export function resolveExpectedRenewalAmountCents(params: {
  amountCents: number;
  contractedPlanPriceCents: number | null | undefined;
}): number {
  const contracted = params.contractedPlanPriceCents;
  if (contracted != null && contracted >= 0) return Math.trunc(contracted);
  return Math.max(0, Math.trunc(params.amountCents));
}

/**
 * CS S3 — valor comercial para exibição / previsão (hero, próxima cobrança).
 * Custom: unitário contratado × assentos; senão flat contratado ou amount_cents.
 */
export function resolveSubscriptionCommercialDisplayCents(params: {
  planType: string | null | undefined;
  amountCents: number;
  contractedPlanPriceCents: number | null | undefined;
  contractedPricePerUserCents: number | null | undefined;
  usersCount: number | null | undefined;
}): number {
  if (params.planType === 'custom') {
    const pu = params.contractedPricePerUserCents;
    if (pu != null && pu >= 0) {
      const seats = Math.max(1, params.usersCount ?? 1);
      return Math.max(0, Math.round(pu * seats));
    }
  }
  return resolveExpectedRenewalAmountCents({
    amountCents: params.amountCents,
    contractedPlanPriceCents: params.contractedPlanPriceCents,
  });
}

/** Renovação aberta deve ser cancelada se o valor não bate com o contrato novo. */
export function openPlanRenewalAmountIsStale(
  openAmountCents: number,
  expectedAmountCents: number
): boolean {
  return Math.trunc(openAmountCents) !== Math.trunc(expectedAmountCents);
}

async function bestEffortCancelGatewayCharges(
  rows: CancelledOpenPlanRenewalRow[],
  tenantId: string
): Promise<void> {
  for (const row of rows) {
    const ref = row.gateway_reference_id?.trim();
    if (!ref) continue;
    try {
      const gateway = await getActiveGateway({ billingType: 'saas', tenantId });
      if (gateway && typeof gateway.cancelPayment === 'function') {
        await gateway.cancelPayment(ref);
      }
    } catch (e) {
      console.warn('[CS S2] falha ao cancelar cobrança gateway de plan_renewal', {
        billingId: row.id,
        ref,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export type ReconcileOpenPlanRenewalsResult = {
  cancelledIds: string[];
  createdBillingId: string | null;
  expectedAmountCents: number;
};

/**
 * Cancela `plan_renewal` abertas do tenant e, se necessário, cria pendente da próxima
 * competência no valor contratado (sem createCharge — checkout/job cobram depois).
 */
export async function reconcileOpenPlanRenewalsAfterContractChange(params: {
  tenantId: string;
  subscriptionId: string;
  planId: string;
  billingInterval: BillingInterval | string;
  usersCount: number | null;
  expectedAmountCents: number;
  nextPeriodStart: string;
  nextPeriodEnd: string;
  /** Fatura que acabou de ativar o contrato — nunca cancelar. */
  exceptBillingId?: string | null;
  planNameSnapshot?: string | null;
}): Promise<ReconcileOpenPlanRenewalsResult> {
  const expectedAmountCents = Math.max(0, Math.trunc(params.expectedAmountCents));
  const cancelled = await cancelOpenPlanRenewalBillingsForTenant(
    params.tenantId,
    params.exceptBillingId ?? null
  );
  await bestEffortCancelGatewayCharges(cancelled, params.tenantId);

  const cancelledIds = cancelled.map((r) => r.id);
  let createdBillingId: string | null = null;

  if (expectedAmountCents <= 0) {
    return { cancelledIds, createdBillingId, expectedAmountCents };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.nextPeriodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(params.nextPeriodEnd)) {
    return { cancelledIds, createdBillingId, expectedAmountCents };
  }

  const existing = await findInvoiceBySubscriptionAndPeriod(
    params.subscriptionId,
    params.nextPeriodStart
  );
  if (existing) {
    if (
      existing.billing_reason === 'plan_renewal' &&
      openPlanRenewalAmountIsStale(existing.amount_cents, expectedAmountCents) === false
    ) {
      return { cancelledIds, createdBillingId: existing.id, expectedAmountCents };
    }
    // paid / outro motivo no mesmo período — não duplicar
    if (existing.status === 'paid' || existing.billing_reason !== 'plan_renewal') {
      return { cancelledIds, createdBillingId, expectedAmountCents };
    }
  }

  // Só recria se havia renovação aberta (usuário já via pendência) OU se cancelamos alguma.
  // Evita inventar fatura futura em 1ª contratação limpa sem histórico de renewal.
  if (cancelledIds.length === 0) {
    return { cancelledIds, createdBillingId, expectedAmountCents };
  }

  const billing = await createInvoice({
    tenant_id: params.tenantId,
    plan_id: params.planId,
    billing_interval: params.billingInterval as BillingInterval,
    amount_cents: expectedAmountCents,
    due_date: params.nextPeriodStart,
    source: 'self_service',
    billing_reason: 'plan_renewal',
    users_count: params.usersCount,
    subscription_id: params.subscriptionId,
    period_start: params.nextPeriodStart,
    period_end: params.nextPeriodEnd,
    plan_name_snapshot: params.planNameSnapshot ?? null,
    plan_price_snapshot: expectedAmountCents,
  });
  createdBillingId = billing.id;

  console.log('[CS S2] plan_renewal reconciliada após contrato', {
    tenantId: params.tenantId,
    cancelled: cancelledIds.length,
    createdBillingId,
    expectedAmountCents,
    nextPeriodStart: params.nextPeriodStart,
  });

  return { cancelledIds, createdBillingId, expectedAmountCents };
}
