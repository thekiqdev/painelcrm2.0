/**
 * Billing Engine V2 — Shadow execution context (placeholder Sprint 2.1A).
 */
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';
import type { BillingPlanAggregate } from './billingPlanAggregate.js';
import type { BillingCycle, BillingRule } from './types.js';
import type { BillingPlanRenewalContext } from './billingPlanMapper.js';

export type BillingPlanExecutionContext = {
  plan: BillingPlanAggregate | null;
  items: unknown[] | null;
  cycle: BillingCycle | null;
  rules: BillingRule | null;
  customer: { id: string } | null;
  subscription: SubscriptionRow | null;
  renewalContext: BillingPlanRenewalContext | null;
};

export function emptyBillingPlanExecutionContext(): BillingPlanExecutionContext {
  return {
    plan: null,
    items: null,
    cycle: null,
    rules: null,
    customer: null,
    subscription: null,
    renewalContext: null,
  };
}
