/**
 * Billing Engine V2 — Sprint 2.3D: normaliza ProjectedInvoice para comparação Shadow.
 */
import type { NormalizedRenewalResult } from '../internal-tools/billing-migration/billingShadow/types.js';
import type { ProjectedInvoice, ProjectionResult } from './types.js';
import { PROJECTION_ENGINE_VERSION } from './types.js';

export function normalizeProjectedInvoice(projected: ProjectedInvoice): NormalizedRenewalResult {
  const hasCharge = projected.grandTotal > 0;
  return {
    subscription: {
      id: projected.invoice.subscription_id,
      customer: projected.invoice.customer_id,
      tenant: projected.invoice.tenant_id,
      status: 'active',
    },
    cycle: projected.invoice.cycle_key,
    billingPlanVersion: projected.invoice.billing_plan_version,
    itemCount: projected.invoiceItems.length,
    items: projected.invoiceItems.map((it) => ({
      sequence: it.sequence,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      discount: it.discount,
      tax: it.tax,
      currency: it.currency,
      total: it.total,
      definition_hash: it.definitionHash,
      name: it.description,
    })),
    subtotal: projected.subtotal,
    discounts: projected.discounts,
    taxes: projected.taxes,
    total: projected.grandTotal,
    currency: projected.currency,
    dueDate: projected.dueDate,
    periodStart: projected.period.periodStart,
    periodEnd: projected.period.periodEnd,
    gatewayPayload: projected.gateway,
    notificationPayload: projected.notifications,
    timelineEvents: projected.timeline,
    historyEvents: projected.history,
    sideEffects: {
      invoice: hasCharge,
      notification: hasCharge,
      timeline: hasCharge,
      history: hasCharge,
      gateway: hasCharge && Boolean(projected.gateway?.payload?.provider),
    },
    metadata: {
      ...projected.metadata,
      source: 'billing_projection_engine',
      projection_engine_version: PROJECTION_ENGINE_VERSION,
      projection_hash: projected.diagnostics.hash,
      projection_build_time_ms: projected.diagnostics.calculationTime,
    },
  };
}

export function normalizeProjectionResult(result: ProjectionResult): NormalizedRenewalResult {
  return normalizeProjectedInvoice(result.projectedInvoice);
}
