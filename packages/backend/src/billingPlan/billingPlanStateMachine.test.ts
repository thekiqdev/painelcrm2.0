import { describe, it, expect } from 'vitest';
import {
  canTransitionBillingPlanStatus,
  canTransitionBillingPlanState,
  assertBillingPlanStatusTransition,
  listAllowedStatusTransitions,
} from './billingPlanStateMachine.js';

describe('BillingPlanStateMachine', () => {
  it('status draft → active', () => {
    expect(canTransitionBillingPlanStatus('draft', 'active')).toBe(true);
    expect(canTransitionBillingPlanStatus('draft', 'archived')).toBe(false);
  });

  it('status active → archived', () => {
    expect(canTransitionBillingPlanStatus('active', 'archived')).toBe(true);
  });

  it('plan_state draft → running', () => {
    expect(canTransitionBillingPlanState('draft', 'running')).toBe(true);
    expect(canTransitionBillingPlanState('running', 'paused')).toBe(true);
  });

  it('assertBillingPlanStatusTransition lança em transição inválida', () => {
    expect(() => assertBillingPlanStatusTransition('archived', 'active')).toThrow(
      'billing_plan_status_transition_invalid'
    );
  });

  it('listAllowedStatusTransitions', () => {
    expect(listAllowedStatusTransitions('draft')).toContain('active');
  });
});
