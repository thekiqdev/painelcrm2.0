import type { PoolClient } from 'pg';
import { BillingPlanService } from '../../billingPlan/billingPlanService.js';
import { BillingPlanRepository } from '../../billingPlan/billingPlanRepository.js';
import type { BillingPlanRow } from '../../billingPlan/types.js';
import { BillingPlanItemRepository } from '../../billingPlanItems/repository.js';
import type { BillingPlanItemRow } from '../../billingPlanItems/types.js';
import type { SubscriptionRow } from '../../services/billingSubscriptionService.js';
import { pool } from '../../utils/db.js';
import { normalizeBillingDateFromDb } from '../../billingRuntime/billingRuntimeAssertions.js';
import { safeParseYmd } from '../../utils/billingSafeDate.js';
import {
  createActiveBillingPlanForSubscription,
  createBillingPlanItemsForSubscription,
} from './billingPlanAutoProvision.js';
import { logBillingProvision } from './billingPlanProvisionLogger.js';
import { BillingPlanProvisionError } from './types.js';

type Db = Pick<import('pg').Pool, 'query'> | PoolClient;

function resolvePeriodStart(subscription: SubscriptionRow): string {
  return (
    normalizeBillingDateFromDb(subscription.current_period_start) ??
    normalizeBillingDateFromDb(subscription.next_billing_date) ??
    safeParseYmd(subscription.next_billing_date) ??
    new Date().toISOString().slice(0, 10)
  );
}

async function repairItemEffectiveWindow(params: {
  subscription: SubscriptionRow;
  plan: BillingPlanRow;
  itemRepo: BillingPlanItemRepository;
  periodStartYmd: string;
  storedItems: BillingPlanItemRow[];
  db: Db;
}): Promise<BillingPlanItemRow[]> {
  const { subscription, plan, itemRepo, periodStartYmd, storedItems, db } = params;
  const activeItems = storedItems.filter((it) => it.status === 'active' || it.status === 'draft');
  const targets = activeItems.length > 0 ? activeItems : storedItems;

  for (const item of targets) {
    if (item.status !== 'active') {
      await itemRepo.setStatus(item.id, subscription.tenant_id, 'active');
    }
    await itemRepo.update({
      id: item.id,
      tenant_id: subscription.tenant_id,
      effective_from: periodStartYmd,
      effective_until: null,
    });
  }

  const effective = await itemRepo.findEffective(plan.id, subscription.tenant_id, periodStartYmd);
  if (effective.length > 0) {
    logBillingProvision('REPAIR', 'items_effective_window_fixed', {
      subscription_id: subscription.id,
      billing_plan_id: plan.id,
      item_count: effective.length,
      period_start: periodStartYmd,
    });
    return effective;
  }

  return createBillingPlanItemsForSubscription(subscription, plan, db);
}

async function resolveOrCreateActivePlan(
  subscription: SubscriptionRow,
  db: Db
): Promise<{ plan: BillingPlanRow; created: boolean }> {
  const planRepo = new BillingPlanRepository(db);
  const planService = new BillingPlanService(planRepo);

  const active = await planRepo.findActiveBySubscription(subscription.id, subscription.tenant_id);
  if (active) {
    return { plan: active, created: false };
  }

  const versions = await planRepo.findVersions(subscription.id, subscription.tenant_id);
  const draft = versions.find((v) => v.status === 'draft');
  if (draft) {
    const activated = await planService.activatePlan(draft.id, subscription.tenant_id);
    logBillingProvision('REPAIR', 'draft_plan_activated', {
      subscription_id: subscription.id,
      billing_plan_id: activated.id,
    });
    return { plan: activated, created: false };
  }

  if (versions.length > 0) {
    const latest = versions[0]!;
    const duplicated = await planService.duplicatePlan(latest.id, subscription.tenant_id);
    const activated = await planService.activatePlan(duplicated.id, subscription.tenant_id);
    logBillingProvision('REPAIR', 'plan_duplicated_and_activated', {
      subscription_id: subscription.id,
      billing_plan_id: activated.id,
      source_plan_id: latest.id,
    });
    return { plan: activated, created: true };
  }

  const created = await createActiveBillingPlanForSubscription(subscription, db);
  return { plan: created, created: true };
}

export async function repairBillingPlanForSubscription(
  subscription: SubscriptionRow,
  options: { periodStartYmd?: string; db?: Db } = {}
): Promise<{ plan: BillingPlanRow; items: BillingPlanItemRow[]; createdPlan: boolean; createdItems: boolean }> {
  const db = options.db ?? pool;
  const periodStartYmd = options.periodStartYmd ?? resolvePeriodStart(subscription);
  const itemRepo = new BillingPlanItemRepository(db);

  const { plan, created: createdPlan } = await resolveOrCreateActivePlan(subscription, db);

  let effective = await itemRepo.findEffective(plan.id, subscription.tenant_id, periodStartYmd);
  let createdItems = false;

  if (effective.length === 0) {
    const allItems = await itemRepo.findByBillingPlan(plan.id, subscription.tenant_id);
    if (allItems.length === 0) {
      effective = await createBillingPlanItemsForSubscription(subscription, plan, db);
      createdItems = true;
    } else {
      logBillingProvision('REPAIR', 'items_exist_but_not_effective', {
        subscription_id: subscription.id,
        billing_plan_id: plan.id,
        stored_items: allItems.length,
        period_start: periodStartYmd,
      });
      effective = await repairItemEffectiveWindow({
        subscription,
        plan,
        itemRepo,
        periodStartYmd,
        storedItems: allItems,
        db,
      });
      createdItems = true;
    }
  }

  if (effective.length === 0) {
    throw new BillingPlanProvisionError(
      'Falha ao reparar Billing Plan Items',
      'REPAIR_FAILED',
      { subscription_id: subscription.id, billing_plan_id: plan.id }
    );
  }

  logBillingProvision('REPAIR', 'complete', {
    subscription_id: subscription.id,
    billing_plan_id: plan.id,
    item_count: effective.length,
    created_plan: createdPlan,
    created_items: createdItems,
  });

  return { plan, items: effective, createdPlan, createdItems };
}
