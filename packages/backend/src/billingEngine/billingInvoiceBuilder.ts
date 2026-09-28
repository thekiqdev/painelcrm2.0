/**
 * Billing Engine V2 — Sprint 3.0: monta CustomerInvoiceDraft a partir do pipeline.
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { TaxedProjectionItem } from '../billingProjection/projectionTaxCalculator.js';
import type { ProjectionTotals } from '../billingProjection/projectionTotalCalculator.js';
import type { CustomerInvoiceDraft, CustomerInvoiceItemDraft } from './types.js';

export function buildCustomerInvoiceDraft(
  context: BillingExecutionContext,
  totals: ProjectionTotals
): CustomerInvoiceDraft {
  const customerId = context.subscription.customer_id;
  if (!customerId) {
    throw new Error('customer_id obrigatório para CustomerInvoiceDraft');
  }

  const periodEnd = context.period.periodEnd ?? context.dates.periodEnd ?? context.dates.periodStart;
  const dueDate = context.dates.dueDate ?? context.period.dueDate ?? context.dates.periodStart;

  return {
    tenant_id: context.subscription.tenant_id,
    client_id: customerId,
    subscription_id: context.subscription.id,
    period_start: context.period.periodStart,
    period_end: periodEnd,
    amount_cents: totals.grandTotal,
    due_date: dueDate,
    gateway: context.gateway.provider ?? context.subscription.gateway ?? null,
    currency: context.billingPlan.currency || context.subscription.currency || 'BRL',
    cycle_key: context.cycle,
    billing_plan_id: context.billingPlan.id,
    billing_plan_version: context.billingPlan.version,
    billing_plan_revision: context.billingPlan.plan_revision,
    subtotal_cents: totals.subtotal,
    discounts_cents: totals.discounts,
    taxes_cents: totals.taxes,
    fees_cents: totals.fees,
    origin: 'subscription',
    invoice_type: 'subscription',
  };
}

export function buildCustomerInvoiceItemDrafts(taxed: TaxedProjectionItem[]): CustomerInvoiceItemDraft[] {
  return taxed.map((line) => ({
    billing_plan_item_id: line.resolved.item.id,
    sequence: line.resolved.item.sequence,
    description: line.resolved.item.name,
    quantity: line.quantity,
    unit_price_cents: line.unitPrice,
    discount_cents: line.discount,
    tax_cents: line.tax,
    total_cents: line.total,
    is_recurring: line.resolved.item.is_recurring,
    recurring_interval: line.resolved.item.billing_interval,
    definition_hash: line.resolved.definitionHash,
    item_revision: line.resolved.effectiveRevision,
  }));
}
