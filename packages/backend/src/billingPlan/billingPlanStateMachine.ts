/**
 * Billing Engine V2 — máquina de estados do Billing Plan (domínio puro).
 * status (lifecycle) e plan_state (operacional) são independentes.
 */
import type { BillingPlanState, BillingPlanStatus } from './types.js';

export type BillingPlanStatusTransition = {
  from: BillingPlanStatus;
  to: BillingPlanStatus;
};

export type BillingPlanStateTransition = {
  from: BillingPlanState;
  to: BillingPlanState;
};

const ALLOWED_STATUS_TRANSITIONS: BillingPlanStatusTransition[] = [
  { from: 'draft', to: 'active' },
  { from: 'draft', to: 'cancelled' },
  { from: 'active', to: 'archived' },
  { from: 'active', to: 'cancelled' },
  { from: 'archived', to: 'cancelled' },
];

const ALLOWED_PLAN_STATE_TRANSITIONS: BillingPlanStateTransition[] = [
  { from: 'draft', to: 'running' },
  { from: 'draft', to: 'cancelled' },
  { from: 'running', to: 'paused' },
  { from: 'running', to: 'expired' },
  { from: 'running', to: 'completed' },
  { from: 'running', to: 'cancelled' },
  { from: 'paused', to: 'running' },
  { from: 'paused', to: 'cancelled' },
  { from: 'expired', to: 'completed' },
  { from: 'expired', to: 'cancelled' },
];

export function canTransitionBillingPlanStatus(
  from: BillingPlanStatus,
  to: BillingPlanStatus
): boolean {
  if (from === to) return true;
  return ALLOWED_STATUS_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function canTransitionBillingPlanState(
  from: BillingPlanState,
  to: BillingPlanState
): boolean {
  if (from === to) return true;
  return ALLOWED_PLAN_STATE_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

export function assertBillingPlanStatusTransition(
  from: BillingPlanStatus,
  to: BillingPlanStatus
): void {
  if (!canTransitionBillingPlanStatus(from, to)) {
    throw new Error(`billing_plan_status_transition_invalid:${from}->${to}`);
  }
}

export function assertBillingPlanStateTransition(
  from: BillingPlanState,
  to: BillingPlanState
): void {
  if (!canTransitionBillingPlanState(from, to)) {
    throw new Error(`billing_plan_state_transition_invalid:${from}->${to}`);
  }
}

export function listAllowedStatusTransitions(
  from: BillingPlanStatus
): BillingPlanStatus[] {
  return ALLOWED_STATUS_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}

export function listAllowedPlanStateTransitions(
  from: BillingPlanState
): BillingPlanState[] {
  return ALLOWED_PLAN_STATE_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}
