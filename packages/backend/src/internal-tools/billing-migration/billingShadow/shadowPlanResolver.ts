/**
 * Billing Engine V2 — delega para BillingExecutionContext planItemResolver.
 * @deprecated Consumir BillingExecutionContextBuilder diretamente.
 */
import type { SubscriptionRow } from '../../../services/billingSubscriptionService.js';
import type { BillingPlanRow } from '../../../billingPlan/types.js';
import type { BillingPlanItemRow } from '../../../billingPlanItems/types.js';
import { resolvePlanAndItems } from '../../../billingExecutionContext/planItemResolver.js';

export type ShadowPlanResolution = {
  billingPlan: BillingPlanRow;
  billingItems: BillingPlanItemRow[];
  source: 'persisted_plan';
};

export async function resolveShadowBillingPlanAndItems(params: {
  subscription: SubscriptionRow;
  periodStartYmd: string;
}): Promise<ShadowPlanResolution> {
  const resolution = await resolvePlanAndItems(params);
  return {
    billingPlan: resolution.billingPlan,
    billingItems: resolution.billingItems,
    source: resolution.planSource,
  };
}
