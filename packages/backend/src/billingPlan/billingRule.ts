/**
 * Billing Engine V2 — regras de billing (conceito; sem persistência).
 */
import type { BillingPlanRow, BillingRule } from './types.js';

export function buildDefaultBillingRuleFromPlan(plan: BillingPlanRow): BillingRule {
  return {
    billing_interval: plan.billing_interval,
    billing_frequency: plan.billing_frequency,
    billing_anchor: plan.billing_anchor,
    proration_enabled: false,
    trial_until: plan.trial_until,
    generation_days_before_due: null,
    retry_max_attempts: null,
    grace_period_days: null,
  };
}

export function mergeBillingRules(
  base: BillingRule,
  patch: Partial<BillingRule>
): BillingRule {
  return { ...base, ...patch };
}
