import { describe, it, expect } from 'vitest';
import {
  assertBillingPlanItemStatusTransition,
  canTransitionBillingPlanItemStatus,
  listAllowedBillingPlanItemStatusTransitions,
} from './stateMachine.js';

describe('BillingPlanItem lifecycle', () => {
  it('draft → active permitido', () => {
    expect(canTransitionBillingPlanItemStatus('draft', 'active')).toBe(true);
  });

  it('archived → active bloqueado', () => {
    expect(canTransitionBillingPlanItemStatus('archived', 'active')).toBe(false);
  });

  it('assert lança em transição inválida', () => {
    expect(() => assertBillingPlanItemStatusTransition('cancelled', 'active')).toThrow(
      'billing_plan_item_status_transition_invalid'
    );
  });

  it('lista transições a partir de active', () => {
    expect(listAllowedBillingPlanItemStatusTransitions('active')).toContain('paused');
    expect(listAllowedBillingPlanItemStatusTransitions('active')).toContain('archived');
  });
});
