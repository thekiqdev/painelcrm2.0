/**
 * Billing Plan factory — monta plano a partir da assinatura (sem persistir).
 */import type { SubscriptionRow } from '../services/billingSubscriptionService.js';
import { safeParseYmd } from '../utils/billingSafeDate.js';
import { BillingPlanMetadata } from './billingPlanMetadata.js';
import type { BillingPlanCreateInput } from './types.js';

export function buildBillingPlanFromSubscription(
  subscription: SubscriptionRow,
  options: { version?: number; status?: BillingPlanCreateInput['status'] } = {}
): BillingPlanCreateInput {
  const startsAt =
    safeParseYmd(subscription.current_period_start) ??
    safeParseYmd(subscription.next_billing_date) ??
    subscription.next_billing_date.slice(0, 10);

  const metadata = BillingPlanMetadata.fromJson({
    origin: {
      source: 'billing_plan_factory',
      mapped_from_subscription_id: subscription.id,
      subscription_status: subscription.status,
      subscription_type: subscription.type,
    },
    engine: {
      engine_version: 'v2',
      billing_strategy: 'billing_plan_items',
    },
    created_from: 'subscription',
  }).toJson();

  return {
    tenant_id: subscription.tenant_id,
    subscription_id: subscription.id,
    status: options.status ?? 'draft',
    version: options.version ?? 1,
    plan_revision: 1,
    plan_state: (options.status ?? 'draft') === 'active' ? 'running' : 'draft',
    created_from: 'subscription',
    engine_version: 'v2',
    billing_strategy: 'billing_plan_items',
    currency: subscription.currency?.trim() || 'BRL',
    billing_interval: subscription.billing_interval,
    billing_frequency: 1,
    billing_anchor: subscription.billing_anchor_day,
    starts_at: startsAt,
    ends_at: safeParseYmd(subscription.current_period_end),
    trial_until:
      subscription.status === 'trialing'
        ? safeParseYmd(subscription.current_period_end)
        : null,
    next_generation_at: null,
    metadata,
  };
}
