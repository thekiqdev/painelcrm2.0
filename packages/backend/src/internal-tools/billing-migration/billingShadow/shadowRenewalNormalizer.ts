/**
 * Billing Engine V2 — normaliza resultado Shadow para comparação.
 */
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import type { BillingPlanRow } from '../../../billingPlan/types.js';
import type { SubscriptionRow } from '../../../services/billingSubscriptionService.js';
import type { NormalizedRenewalResult, ShadowExecutionResult } from './types.js';

export function normalizeShadowRenewalFromContext(params: {
  context: BillingExecutionContext;
  shadow: ShadowExecutionResult;
}): NormalizedRenewalResult {
  return {
    ...params.shadow.normalized,
    metadata: {
      ...params.shadow.normalized.metadata,
      source: 'billing_plan_v2_shadow',
      plan_number: params.context.billingPlan.plan_number,
      plan_revision: params.context.billingPlan.plan_revision,
      shadow_engine_version: params.shadow.engineVersion,
      context_build_time_ms: params.context.diagnostics.contextBuildTime,
    },
  };
}

/** @deprecated use normalizeShadowRenewalFromContext */
export function normalizeShadowRenewal(params: {
  subscription: SubscriptionRow;
  billingPlan: BillingPlanRow;
  cycleKey: string;
  shadow: ShadowExecutionResult;
}): NormalizedRenewalResult {
  const { subscription, billingPlan, cycleKey, shadow } = params;
  return {
    ...shadow.normalized,
    subscription: {
      id: subscription.id,
      customer: subscription.customer_id,
      tenant: subscription.tenant_id,
      status: subscription.status,
    },
    cycle: cycleKey,
    billingPlanVersion: billingPlan.version,
    metadata: {
      ...shadow.normalized.metadata,
      source: 'billing_plan_v2_shadow',
      plan_number: billingPlan.plan_number,
      plan_revision: billingPlan.plan_revision,
      shadow_engine_version: shadow.engineVersion,
    },
  };
}
