/**
 * Billing Engine V2 — lifecycle do Billing Item (independente do Billing Plan).
 */
import type { BillingPlanItemStatus } from './types.js';

export type BillingPlanItemStatusTransition = {
  from: BillingPlanItemStatus;
  to: BillingPlanItemStatus;
};

const ALLOWED_TRANSITIONS: BillingPlanItemStatusTransition[] = [
  { from: 'draft', to: 'active' },
  { from: 'draft', to: 'cancelled' },
  { from: 'active', to: 'paused' },
  { from: 'active', to: 'archived' },
  { from: 'active', to: 'cancelled' },
  { from: 'paused', to: 'active' },
  { from: 'paused', to: 'archived' },
  { from: 'paused', to: 'cancelled' },
  { from: 'archived', to: 'cancelled' },
];

export function canTransitionBillingPlanItemStatus(
  from: BillingPlanItemStatus,
  to: BillingPlanItemStatus
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function assertBillingPlanItemStatusTransition(
  from: BillingPlanItemStatus,
  to: BillingPlanItemStatus
): void {
  if (!canTransitionBillingPlanItemStatus(from, to)) {
    throw new Error(`billing_plan_item_status_transition_invalid:${from}->${to}`);
  }
}

export function listAllowedBillingPlanItemStatusTransitions(
  from: BillingPlanItemStatus
): BillingPlanItemStatus[] {
  return ALLOWED_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}
