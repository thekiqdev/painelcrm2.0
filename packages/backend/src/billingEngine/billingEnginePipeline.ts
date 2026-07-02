/**
 * Billing Engine V2 — Sprint 3.0: pipeline de produção (reutiliza calculadores Projection).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { computeProjectionHash } from '../billingProjection/projectionHash.js';
import { calculateBillingDiscounts } from './billingDiscountCalculator.js';
import { buildBillingGatewayPayload } from './billingGatewayPayloadBuilder.js';
import { buildBillingHistoryEvents } from './billingHistoryBuilder.js';
import { resolveBillingItemsForEngine } from './billingItemResolver.js';
import { buildBillingNotificationPayloads } from './billingNotificationBuilder.js';
import { calculateBillingPrices } from './billingPriceCalculator.js';
import { calculateBillingTaxes } from './billingTaxCalculator.js';
import { buildBillingTimelineEvents } from './billingTimelineBuilder.js';
import { calculateBillingTotals } from './billingTotalsCalculator.js';
import type { BillingEnginePipelineStage } from './types.js';

export function runBillingEnginePipeline(context: BillingExecutionContext): BillingEnginePipelineStage {
  const itemDrafts = resolveBillingItemsForEngine(context);
  const priced = calculateBillingPrices(itemDrafts);
  const discounted = calculateBillingDiscounts(priced);
  const taxed = calculateBillingTaxes(discounted);
  const totals = calculateBillingTotals(taxed, context.gateway.fees);
  const gateway = buildBillingGatewayPayload(context, totals.grandTotal);
  const notifications = buildBillingNotificationPayloads(context, totals.grandTotal);
  const timeline = buildBillingTimelineEvents(context, totals.grandTotal);
  const history = buildBillingHistoryEvents(context, totals.grandTotal);

  return {
    itemDrafts,
    priced,
    discounted,
    taxed,
    totals,
    gateway,
    notifications: notifications[0] ?? null,
    timeline,
    history,
  };
}

export function computeEngineProjectionHash(
  context: BillingExecutionContext,
  pipeline: BillingEnginePipelineStage
): string {
  const invoiceItems = pipeline.taxed.map((it) => ({
    sequence: it.resolved.item.sequence,
    definitionHash: it.resolved.definitionHash,
    description: it.resolved.item.name,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    discount: it.discount,
    tax: it.tax,
    subtotal: it.lineSubtotal,
    total: it.total,
    currency: it.currency,
    billingRule: it.resolved.item.billing_interval,
    effectiveRevision: it.resolved.effectiveRevision,
  }));

  return computeProjectionHash({
    invoice: {
      subscription_id: context.subscription.id,
      tenant_id: context.subscription.tenant_id,
      customer_id: context.subscription.customer_id,
      cycle_key: context.cycle,
      billing_plan_id: context.billingPlan.id,
      billing_plan_version: context.billingPlan.version,
      currency: context.billingPlan.currency || context.subscription.currency || 'BRL',
    },
    invoiceItems,
    subtotal: pipeline.totals.subtotal,
    discounts: pipeline.totals.discounts,
    taxes: pipeline.totals.taxes,
    fees: pipeline.totals.fees,
    grandTotal: pipeline.totals.grandTotal,
    currency: context.billingPlan.currency || context.subscription.currency || 'BRL',
    period: context.period,
    dueDate: context.dates.dueDate,
    gateway: pipeline.gateway,
    notifications: pipeline.notifications,
    timeline: pipeline.timeline,
    history: pipeline.history,
    metadata: {
      engine: 'billing_engine',
      plan_source: context.metadata.plan_source,
    },
    diagnostics: {
      calculationTime: 0,
      warnings: [],
      errors: [],
      hash: '',
      calculatorVersions: {},
      cacheHit: false,
      builderVersion: '1.0.0',
    },
  });
}
