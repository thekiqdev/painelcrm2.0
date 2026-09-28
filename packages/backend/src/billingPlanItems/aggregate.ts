/**
 * Billing Engine V2 — composição de items no aggregate (sem regras).
 */
import type { BillingPlanRow } from '../billingPlan/types.js';
import { BillingPlanAggregate } from '../billingPlan/billingPlanAggregate.js';
import type { BillingItemSnapshot } from '../billingPlanItemSnapshot/types.js';
import type { BillingPlanItemRow } from './types.js';

export type BillingPlanItemAggregateExtras = {
  currentRevision?: number | null;
  revisionHistory?: BillingPlanItemRow[];
  snapshots?: BillingItemSnapshot[];
};

export function attachItemsToBillingPlanAggregate(
  plan: BillingPlanRow,
  items: BillingPlanItemRow[],
  extras?: BillingPlanItemAggregateExtras
): BillingPlanAggregate {
  return BillingPlanAggregate.create({
    plan,
    items,
    currentRevision: extras?.currentRevision ?? null,
    revisionHistory: extras?.revisionHistory ?? [],
    snapshots: extras?.snapshots ?? [],
  });
}

export function billingPlanAggregateWithItems(
  aggregate: BillingPlanAggregate,
  items: BillingPlanItemRow[],
  extras?: BillingPlanItemAggregateExtras
): BillingPlanAggregate {
  return BillingPlanAggregate.create({
    plan: aggregate.plan,
    cycles: aggregate.cycles,
    rules: aggregate.rules,
    items,
    currentRevision: extras?.currentRevision ?? aggregate.currentRevision,
    revisionHistory: extras?.revisionHistory ?? aggregate.revisionHistory,
    snapshots: extras?.snapshots ?? aggregate.snapshots,
  });
}

export function resolveCurrentItemRevision(items: BillingPlanItemRow[]): number | null {
  if (items.length === 0) return null;
  return Math.max(...items.map((i) => i.item_revision));
}
