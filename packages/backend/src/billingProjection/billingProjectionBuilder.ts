/**
 * Billing Engine V2 — Sprint 2.3D: monta ProjectedInvoice por estágios (READ ONLY).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { calculateProjectionDiscounts } from './projectionDiscountCalculator.js';
import { resolveProjectionGateway } from './projectionGatewayResolver.js';
import { resolveProjectionHistory } from './projectionHistoryResolver.js';
import { resolveProjectionItems } from './projectionItemResolver.js';
import { resolveProjectionNotification } from './projectionNotificationResolver.js';
import { calculateProjectionPrices } from './projectionPriceCalculator.js';
import { calculateProjectionTaxes } from './projectionTaxCalculator.js';
import { resolveProjectionTimeline } from './projectionTimelineResolver.js';
import { calculateProjectionTotals } from './projectionTotalCalculator.js';
import { createProjectionDiagnostics } from './projectionDiagnostics.js';
import { computeProjectionHash } from './projectionHash.js';
import { logProjectionStage } from './projectionLogger.js';
import type {
  ProjectedInvoice,
  ProjectedInvoiceItem,
  ProjectionResult,
  ProjectionStage,
} from './types.js';
import { PROJECTION_ENGINE_VERSION } from './types.js';

function logStage(
  stage: ProjectionStage,
  context: BillingExecutionContext,
  started: number
): void {
  logProjectionStage(stage, {
    correlation_id: context.metadata.correlation_id ?? undefined,
    subscription_id: context.subscription.id,
    cycle_key: context.cycle,
    duration_ms: Date.now() - started,
  });
}

export function buildProjectedInvoice(
  context: BillingExecutionContext,
  cacheHit = false
): ProjectionResult {
  const overallStarted = Date.now();
  const warnings: string[] = [];
  const errors: string[] = [...context.diagnostics.errors];

  if (!context.diagnostics.shadowReady) {
    warnings.push('context_not_shadow_ready');
  }
  if (context.resolvedItems.length === 0) {
    warnings.push('no_resolved_items');
  }

  let stageStart = Date.now();
  logStage('ProjectionValidation', context, stageStart);

  stageStart = Date.now();
  const itemDrafts = resolveProjectionItems(context);
  logStage('ProjectionItems', context, stageStart);

  stageStart = Date.now();
  const priced = calculateProjectionPrices(itemDrafts);
  logStage('ProjectionPricing', context, stageStart);

  stageStart = Date.now();
  const discounted = calculateProjectionDiscounts(priced);
  logStage('ProjectionDiscounts', context, stageStart);

  stageStart = Date.now();
  const taxed = calculateProjectionTaxes(discounted);
  logStage('ProjectionTaxes', context, stageStart);

  stageStart = Date.now();
  const totals = calculateProjectionTotals(taxed, context.gateway.fees);
  logStage('ProjectionTotals', context, stageStart);

  stageStart = Date.now();
  const gateway = resolveProjectionGateway(context, totals.grandTotal);
  logStage('ProjectionGateway', context, stageStart);

  stageStart = Date.now();
  const notifications = resolveProjectionNotification(context, totals.grandTotal);
  logStage('ProjectionNotification', context, stageStart);

  stageStart = Date.now();
  const timeline = resolveProjectionTimeline(context, totals.grandTotal);
  logStage('ProjectionTimeline', context, stageStart);

  stageStart = Date.now();
  const history = resolveProjectionHistory(context, totals.grandTotal);
  logStage('ProjectionHistory', context, stageStart);

  const invoiceItems: ProjectedInvoiceItem[] = taxed.map((it) => ({
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

  const calculationTime = Date.now() - overallStarted;

  const projectedInvoiceBase: Omit<ProjectedInvoice, 'diagnostics'> = {
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
    subtotal: totals.subtotal,
    discounts: totals.discounts,
    taxes: totals.taxes,
    fees: totals.fees,
    grandTotal: totals.grandTotal,
    currency: context.billingPlan.currency || context.subscription.currency || 'BRL',
    period: context.period,
    dueDate: context.dates.dueDate,
    gateway,
    notifications,
    timeline,
    history,
    metadata: {
      projection_mode: true,
      plan_source: context.metadata.plan_source,
      correlation_id: context.metadata.correlation_id,
      execution_mode: context.metadata.execution_mode,
      plan_number: context.billingPlan.plan_number,
      plan_revision: context.billingPlan.plan_revision,
      projection_engine_version: PROJECTION_ENGINE_VERSION,
    },
  };

  const hash = computeProjectionHash({
    ...projectedInvoiceBase,
    diagnostics: createProjectionDiagnostics({
      calculationTime: 0,
      warnings,
      errors,
      hash: '',
      cacheHit,
    }),
  });

  const diagnostics = createProjectionDiagnostics({
    calculationTime,
    warnings,
    errors,
    hash,
    cacheHit,
  });

  const projectedInvoice: ProjectedInvoice = {
    ...projectedInvoiceBase,
    diagnostics,
  };

  logStage('ProjectionComplete', context, overallStarted);

  const approved = errors.length === 0;

  return {
    projectedInvoice,
    projectionWarnings: warnings,
    projectionErrors: errors,
    duration: calculationTime,
    approved,
    diagnostics,
  };
}
