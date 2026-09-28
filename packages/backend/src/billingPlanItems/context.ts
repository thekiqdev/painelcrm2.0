/**
 * Billing Engine V2 — Renewal context placeholder (Sprint 2.3).
 */
import type { BillingItemSnapshot } from '../billingPlanItemSnapshot/types.js';
import type { BillingPlanItemRow } from './types.js';

export type BillingPlanItemsContext = {
  items: BillingPlanItemRow[];
  eligibleItems: BillingPlanItemRow[];
  futureItems: BillingPlanItemRow[];
  currentRevision: number | null;
  definitionHash: string | null;
  snapshot: BillingItemSnapshot | null;
  futureSnapshot: BillingItemSnapshot | null;
};

export function emptyBillingPlanItemsContext(): BillingPlanItemsContext {
  return {
    items: [],
    eligibleItems: [],
    futureItems: [],
    currentRevision: null,
    definitionHash: null,
    snapshot: null,
    futureSnapshot: null,
  };
}
