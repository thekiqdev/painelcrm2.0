/**
 * Billing Engine V2 — normaliza resultado do Motor V1 para comparação.
 */
import { pool } from '../../../utils/db.js';
import { getCustomerInvoiceItems } from '../../../services/customerInvoiceService.js';
import type { BillingRenewalResult } from '../../../services/billingRenewalEngine/types.js';
import type { SubscriptionRow } from '../../../services/billingSubscriptionService.js';
import type { LegacyExecutionResult, NormalizedRenewalResult } from './types.js';

async function loadCustomerInvoice(invoiceId: string, tenantId: string) {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    client_id: string | null;
    subscription_id: string | null;
    period_start: string | null;
    period_end: string | null;
    amount_cents: number;
    due_date: string;
    gateway: string | null;
    payment_method: string | null;
    gateway_status: string | null;
  }>(
    `SELECT id, tenant_id, client_id, subscription_id, period_start, period_end,
            amount_cents, due_date, gateway, payment_method, gateway_status
     FROM customer_invoices WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
    [invoiceId, tenantId]
  );
  return r.rows[0] ?? null;
}

function emptyNormalized(
  subscription: SubscriptionRow,
  cycleKey: string,
  metadata: Record<string, unknown> = {}
): NormalizedRenewalResult {
  return {
    subscription: {
      id: subscription.id,
      customer: subscription.customer_id,
      tenant: subscription.tenant_id,
      status: subscription.status,
    },
    cycle: cycleKey,
    billingPlanVersion: null,
    itemCount: 0,
    items: [],
    subtotal: 0,
    discounts: 0,
    taxes: 0,
    total: 0,
    currency: subscription.currency || 'BRL',
    dueDate: null,
    periodStart: subscription.current_period_start,
    periodEnd: subscription.current_period_end,
    gatewayPayload: null,
    notificationPayload: null,
    timelineEvents: [],
    historyEvents: [],
    sideEffects: {
      invoice: false,
      notification: false,
      timeline: false,
      history: false,
      gateway: false,
    },
    metadata,
  };
}

export async function normalizeLegacyRenewal(params: {
  subscription: SubscriptionRow;
  cycleKey: string;
  periodStartYmd: string;
  renewalResult: BillingRenewalResult;
}): Promise<LegacyExecutionResult> {
  const { subscription, cycleKey, renewalResult } = params;
  const base = emptyNormalized(subscription, cycleKey, {
    source: 'legacy_v1',
    completion_outcome: renewalResult.completionOutcome,
    correlation_id: renewalResult.correlationId,
  });

  if (!renewalResult.invoiceId) {
    return {
      normalized: {
        ...base,
        sideEffects: {
          invoice: false,
          notification: renewalResult.notificationStatus !== 'skipped',
          timeline: renewalResult.timelineStatus === 'ok',
          history: renewalResult.historyStatus === 'ok',
          gateway: false,
        },
        metadata: {
          ...base.metadata,
          subscription_advanced: renewalResult.subscriptionAdvanced,
        },
      },
      raw: {
        invoiceId: null,
        success: renewalResult.success,
        completionOutcome: renewalResult.completionOutcome,
      },
    };
  }

  const invoice = await loadCustomerInvoice(renewalResult.invoiceId, subscription.tenant_id);
  const items = invoice
    ? await getCustomerInvoiceItems(invoice.id, subscription.tenant_id)
    : [];

  const normalizedItems = items.map((it) => ({
    sequence: it.sort_order,
    quantity: Number(it.quantity),
    unit_price: it.unit_price_cents,
    discount: it.discount_cents,
    tax: 0,
    currency: subscription.currency || 'BRL',
    total: it.total_cents,
    definition_hash: null,
    name: it.description,
  }));

  const subtotal = normalizedItems.reduce(
    (sum, it) => sum + Math.round(it.quantity * it.unit_price),
    0
  );
  const discounts = normalizedItems.reduce((sum, it) => sum + it.discount, 0);
  const total = invoice?.amount_cents ?? normalizedItems.reduce((sum, it) => sum + it.total, 0);

  const normalized: NormalizedRenewalResult = {
    ...base,
    itemCount: normalizedItems.length,
    items: normalizedItems,
    subtotal,
    discounts,
    taxes: 0,
    total,
    dueDate: invoice?.due_date?.slice(0, 10) ?? params.periodStartYmd,
    periodStart: invoice?.period_start?.slice(0, 10) ?? params.periodStartYmd,
    periodEnd: invoice?.period_end?.slice(0, 10) ?? subscription.current_period_end,
    gatewayPayload: invoice
      ? {
          payment_method: invoice.payment_method,
          currency: subscription.currency || 'BRL',
          amount: invoice.amount_cents,
          payload: {
            gateway: invoice.gateway,
            gateway_status: invoice.gateway_status,
            invoice_id: invoice.id,
          },
        }
      : null,
    notificationPayload:
      renewalResult.notificationStatus !== 'skipped'
        ? {
            type: 'invoice_created',
            recipient: invoice?.client_id ?? subscription.customer_id,
            template: 'crm_invoice_charge',
            payload: { invoice_id: renewalResult.invoiceId },
          }
        : null,
    timelineEvents: renewalResult.timelineStatus === 'ok'
      ? [{ event: 'renewal_completed', order: 1 }]
      : [],
    historyEvents: renewalResult.historyStatus === 'ok'
      ? [{ change: 'subscription_cycle_advanced', audit: { cycle_key: cycleKey } }]
      : [],
    sideEffects: {
      invoice: true,
      notification: renewalResult.notificationStatus !== 'skipped',
      timeline: renewalResult.timelineStatus === 'ok',
      history: renewalResult.historyStatus === 'ok',
      gateway: renewalResult.gatewayStatus != null,
    },
    metadata: {
      ...base.metadata,
      invoice_number: renewalResult.invoiceNumber,
      gateway_status: renewalResult.gatewayStatus,
      notification_status: renewalResult.notificationStatus,
    },
  };

  return {
    normalized,
    raw: {
      invoiceId: renewalResult.invoiceId,
      success: renewalResult.success,
      completionOutcome: renewalResult.completionOutcome,
    },
  };
}
