/**
 * Billing Engine V2 — Sprint 2.3C: replay utiliza Execution Context (READ ONLY).
 */
import type { BillingExecutionContext } from './types.js';
import type { NormalizedRenewalResult } from '../internal-tools/billing-migration/billingShadow/types.js';

export type BillingExecutionReplayResult = {
  subscription_id: string;
  cycle_key: string;
  normalized: NormalizedRenewalResult;
  replay_only: true;
};

export function replayBillingExecutionFromContext(
  context: BillingExecutionContext
): BillingExecutionReplayResult {
  const currency = context.billingPlan.currency || context.subscription.currency || 'BRL';
  const items = context.resolvedItems.map((ri) => ({
    sequence: ri.item.sequence,
    quantity: ri.resolvedQuantity,
    unit_price: ri.resolvedPrice,
    discount: ri.discounts,
    tax: ri.taxes,
    currency: ri.item.currency || currency,
    total: ri.item.total_amount,
    definition_hash: ri.definitionHash,
    name: ri.item.name,
  }));

  const subtotal = items.reduce((sum, it) => sum + Math.round(it.quantity * it.unit_price), 0);
  const discounts = items.reduce((sum, it) => sum + it.discount, 0);
  const taxes = items.reduce((sum, it) => sum + it.tax, 0);
  const total = items.reduce((sum, it) => sum + it.total, 0);

  return {
    subscription_id: context.subscription.id,
    cycle_key: context.cycle,
    replay_only: true,
    normalized: {
      subscription: {
        id: context.subscription.id,
        customer: context.subscription.customer_id,
        tenant: context.subscription.tenant_id,
        status: context.subscription.status,
      },
      cycle: context.cycle,
      billingPlanVersion: context.billingPlan.version,
      itemCount: items.length,
      items,
      subtotal,
      discounts,
      taxes,
      total,
      currency,
      dueDate: context.dates.dueDate,
      periodStart: context.dates.periodStart,
      periodEnd: context.dates.periodEnd,
      gatewayPayload: {
        payment_method: context.gateway.paymentMethod,
        currency: context.gateway.currency,
        amount: total,
        payload: context.gateway.gatewayMetadata,
      },
      notificationPayload: {
        type: 'invoice_created',
        recipient: context.notifications.recipient,
        template: context.notifications.templates[0] ?? null,
        payload: context.notifications.variables,
      },
      timelineEvents: context.timeline.events,
      historyEvents: context.history.changes.map((c) => ({
        change: c.change,
        audit: c.audit,
      })),
      sideEffects: {
        invoice: total > 0,
        notification: total > 0,
        timeline: false,
        history: false,
        gateway: total > 0 && Boolean(context.gateway.provider),
      },
      metadata: {
        replay_from_context: true,
        correlation_id: context.metadata.correlation_id,
      },
    },
  };
}
