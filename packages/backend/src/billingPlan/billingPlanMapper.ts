/**
 * Billing Engine V2 — conversão Subscription ↔ BillingPlan (Sprint 2.1).
 * RenewalContext será consumido em sprint futura; não utilizado pelo motor atual.
 */
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';
import { buildBillingPlanFromSubscription } from './billingPlanFactory.js';
import type { BillingPlanCreateInput, BillingPlanRow } from './types.js';

export function mapSubscriptionToBillingPlanDraft(
  subscription: SubscriptionRow
): BillingPlanCreateInput {
  return buildBillingPlanFromSubscription(subscription);
}

/** Futuro: BillingPlan → contexto de renovação. Não utilizado na Sprint 2.1. */
export type BillingPlanRenewalContext = {
  subscription_id: string;
  tenant_id: string;
  cycle_key: string | null;
  billing_interval: string;
  currency: string;
  plan_version: number;
};

export function mapBillingPlanToRenewalContext(
  _plan: BillingPlanRow
): BillingPlanRenewalContext {
  throw new Error('billing_plan_renewal_context_not_implemented');
}
