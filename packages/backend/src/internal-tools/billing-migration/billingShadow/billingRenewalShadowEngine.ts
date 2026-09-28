/**
 * Billing Engine V2 — Shadow Renewal Engine (READ ONLY, somente Execution Context).
 */
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import type { NormalizedRenewalItem, NormalizedRenewalResult, ShadowExecutionResult } from './types.js';

function toNormalizedItems(
  context: BillingExecutionContext
): NormalizedRenewalItem[] {
  const currency = context.billingPlan.currency || context.subscription.currency || 'BRL';
  return context.resolvedItems.map((ri) => ({
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
}

export class BillingRenewalShadowEngine {
  /**
   * Simula renovação V2 a partir de BillingExecutionContext — sem gravar.
   */
  static async executeShadow(context: BillingExecutionContext): Promise<ShadowExecutionResult> {
    const started = Date.now();
    const logs: string[] = ['shadow_engine_start'];
    const normalizedItems = toNormalizedItems(context);
    const currency = context.billingPlan.currency || context.subscription.currency || 'BRL';

    const subtotal = normalizedItems.reduce(
      (sum, it) => sum + Math.round(it.quantity * it.unit_price),
      0
    );
    const discounts = normalizedItems.reduce((sum, it) => sum + it.discount, 0);
    const taxes = normalizedItems.reduce((sum, it) => sum + it.tax, 0);
    const total = normalizedItems.reduce((sum, it) => sum + it.total, 0);

    const normalized: NormalizedRenewalResult = {
      subscription: {
        id: context.subscription.id,
        customer: context.subscription.customer_id,
        tenant: context.subscription.tenant_id,
        status: context.subscription.status,
      },
      cycle: context.cycle,
      billingPlanVersion: context.billingPlan.version,
      itemCount: normalizedItems.length,
      items: normalizedItems,
      subtotal,
      discounts,
      taxes,
      total,
      currency,
      dueDate: context.dates.dueDate,
      periodStart: context.dates.periodStart,
      periodEnd: context.dates.periodEnd,
      gatewayPayload:
        total > 0
          ? {
              payment_method: context.gateway.paymentMethod,
              currency: context.gateway.currency,
              amount: total,
              payload: {
                simulated: true,
                ...context.gateway.gatewayMetadata,
                billing_plan_id: context.billingPlan.id,
              },
            }
          : null,
      notificationPayload:
        total > 0
          ? {
              type: 'invoice_created',
              recipient: context.notifications.recipient,
              template: context.notifications.templates[0] ?? 'crm_invoice_charge',
              payload: { simulated: true, cycle_key: context.cycle },
            }
          : null,
      timelineEvents: total > 0 ? [{ event: 'renewal_completed', order: 1 }] : [],
      historyEvents:
        total > 0
          ? [{ change: 'subscription_cycle_advanced', audit: { cycle_key: context.cycle, simulated: true } }]
          : [],
      sideEffects: {
        invoice: total > 0,
        notification: total > 0,
        timeline: total > 0,
        history: total > 0,
        gateway: total > 0 && Boolean(context.gateway.provider),
      },
      metadata: {
        shadow_mode: true,
        eligible_item_count: context.resolvedItems.length,
        billing_plan_id: context.billingPlan.id,
        plan_number: context.billingPlan.plan_number,
        execution_mode: context.metadata.execution_mode,
        correlation_id: context.metadata.correlation_id,
        plan_source: context.metadata.plan_source,
      },
    };

    logs.push(`shadow_engine_complete items=${normalizedItems.length} total=${total}`);

    return {
      success: true,
      normalized,
      engineVersion: 'v2_shadow_sprint_2_3c',
      duration_ms: Date.now() - started,
      logs,
    };
  }
}
