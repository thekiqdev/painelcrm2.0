import { describe, it, expect } from 'vitest';
import { resolveBillingCycleState, isSkippedRecoverable } from './billingStateMachine.js';

describe('billingStateMachine backend', () => {
  it('skipped recoverable → awaiting_generation', () => {
    expect(isSkippedRecoverable('completed_no_invoice_no_eligible_items')).toBe(true);
    const r = resolveBillingCycleState({
      cycleStatus: 'skipped',
      invoiceId: null,
      skippedReason: 'completed_no_invoice_no_eligible_items',
      subscriptionStatus: 'active',
      dueYmd: '2026-08-01',
      todayYmd: '2026-07-01',
    });
    expect(r.state).toBe('awaiting_generation');
  });
});
