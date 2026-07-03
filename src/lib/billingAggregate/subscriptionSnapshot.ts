import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { BillingSubscriptionSnapshot } from './types';

type SubscriptionSource = CrmSubscriptionDetailPayload['subscription'];

/** Copia string opcional do objeto subscription sem inferência. */
function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Copia número opcional sem alteração. */
function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readSubscriptionTimestamp(sub: SubscriptionSource, snakeKey: string): string | null {
  return optionalString((sub as Record<string, unknown>)[snakeKey]);
}

/**
 * Mapeia `context.source.subscription` → `BillingSubscriptionSnapshot`.
 * Sprint 5.0-12: cópia e normalização apenas — sem timeline, cycles ou regras.
 */
export function mapSubscriptionSnapshot(sub: SubscriptionSource): BillingSubscriptionSnapshot {
  return {
    id: sub.id,
    tenantId: sub.tenant_id,
    customerId: sub.customer_id,
    status: sub.status,
    subscriptionType: sub.type,
    billingInterval: sub.billing_interval,
    billingIntervalCount: sub.billing_cycle_count,
    currency: sub.currency,
    amount: sub.amount_cents,
    nextBillingDate: optionalString(sub.next_billing_date),
    currentPeriodStart: optionalString(sub.current_period_start),
    currentPeriodEnd: optionalString(sub.current_period_end),
    billingAnchorDay: optionalNumber(sub.billing_anchor_day),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cancelledAt: readSubscriptionTimestamp(sub, 'cancelled_at'),
    pausedAt: readSubscriptionTimestamp(sub, 'paused_at'),
    reactivatedAt: readSubscriptionTimestamp(sub, 'reactivated_at'),
    trialEndsAt: readSubscriptionTimestamp(sub, 'trial_ends_at'),
    createdAt: sub.created_at,
    updatedAt: sub.updated_at,
    metadata: {
      planId: sub.plan_id,
      gateway: sub.gateway,
      gracePeriodDays: sub.grace_period_days,
      defaultPaymentMethod: sub.default_payment_method,
      usersCount: sub.users_count,
      lastJobAt: sub.last_job_at,
      createdBy: sub.created_by,
      cyclesUnlimited: sub.cycles_unlimited ?? null,
      maxCycles: sub.max_cycles ?? null,
    },
  };
}

export const EMPTY_BILLING_SUBSCRIPTION_SNAPSHOT: BillingSubscriptionSnapshot = {
  id: '',
  tenantId: '',
  customerId: null,
  status: '',
  subscriptionType: '',
  billingInterval: '',
  billingIntervalCount: 0,
  currency: '',
  amount: 0,
  nextBillingDate: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  billingAnchorDay: null,
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  pausedAt: null,
  reactivatedAt: null,
  trialEndsAt: null,
  createdAt: '',
  updatedAt: '',
  metadata: {
    planId: null,
    gateway: null,
    gracePeriodDays: 0,
    defaultPaymentMethod: null,
    usersCount: null,
    lastJobAt: null,
    createdBy: null,
    cyclesUnlimited: null,
    maxCycles: null,
  },
};
