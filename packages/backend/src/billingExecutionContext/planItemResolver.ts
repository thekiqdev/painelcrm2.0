/**
 * Billing Engine V2 — Sprint 3.0B: resolve Billing Plan + Items (somente persistidos).
 */
import { billingPlanRepository } from '../billingPlan/billingPlanRepository.js';
import type { BillingPlanRow } from '../billingPlan/types.js';
import { billingPlanItemRepository } from '../billingPlanItems/repository.js';
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';
import { assertContextIndependence } from './contextIndependenceGuard.js';
import { BillingExecutionContextError, CONTEXT_ERROR_CODES } from './errors.js';

export type PlanItemResolution = {
  billingPlan: BillingPlanRow;
  billingPlans: BillingPlanRow[];
  billingItems: BillingPlanItemRow[];
  planSource: 'persisted_plan';
  hasPersistedPlan: true;
};

function dedupeEffectiveItems(effective: BillingPlanItemRow[]): BillingPlanItemRow[] {
  const currentBySequence = new Map<number, BillingPlanItemRow>();
  for (const item of effective) {
    const prev = currentBySequence.get(item.sequence);
    if (!prev || item.item_revision > prev.item_revision) {
      currentBySequence.set(item.sequence, item);
    }
  }
  return [...currentBySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

export async function resolvePlanAndItems(params: {
  subscription: SubscriptionRow;
  periodStartYmd: string;
}): Promise<PlanItemResolution> {
  const { subscription, periodStartYmd } = params;

  const billingPlans = await billingPlanRepository.findVersions(
    subscription.id,
    subscription.tenant_id
  );

  const persistedPlan = await billingPlanRepository.findActiveBySubscription(
    subscription.id,
    subscription.tenant_id
  );

  if (!persistedPlan) {
    throw new BillingExecutionContextError(
      'Billing Plan persistido não encontrado para a assinatura',
      CONTEXT_ERROR_CODES.BILLING_PLAN_NOT_FOUND
    );
  }

  const effective = await billingPlanItemRepository.findEffective(
    persistedPlan.id,
    subscription.tenant_id,
    periodStartYmd
  );

  const items = dedupeEffectiveItems(effective);

  if (items.length === 0) {
    throw new BillingExecutionContextError(
      'Nenhum Billing Plan Item efetivo encontrado para o período',
      CONTEXT_ERROR_CODES.BILLING_ITEMS_NOT_FOUND
    );
  }

  assertContextIndependence(persistedPlan, items);

  return {
    billingPlan: persistedPlan,
    billingPlans,
    billingItems: items,
    planSource: 'persisted_plan',
    hasPersistedPlan: true,
  };
}
