import { describe, it, expect } from 'vitest';
import { assessManualGenerateReadiness, type RenewalDiagnosis } from './renewalDiagnosisService.js';

function baseDiagnosis(overrides: Partial<RenewalDiagnosis> = {}): RenewalDiagnosis {
  return {
    subscription_id: 'sub-1',
    ready_to_bill: false,
    failure_reason: null,
    validation: {
      subscription_found: true,
      status: 'active',
      type: 'customer',
      tenant_id: 'tenant-1',
    },
    dates: {
      next_billing_date: '2026-07-01',
      next_billing_valid: true,
      current_period_start: '2026-06-01',
      current_period_start_valid: true,
      job_cycle_key: '2026-07-01',
    },
    customer: { customer_id: 'c1', resolvable: true, resolved_via: 'subscription_field' },
    job: null,
    invoice: { template_resolvable: true, resolved_via: 'exact', lookup_attempts: [], reason: null },
    billing_plan: { present: true, item_count: 1, reason: null },
    contract: { has_crm_contract: true, amount_cents: 1000, billing_interval: 'monthly' },
    timeline: { enqueue_block_reason: null, can_attempt_insert: true },
    cycle_invoice: { cycle_ymd: '2026-07-01', exists: false, invoice_id: null },
    ...overrides,
  };
}

describe('assessManualGenerateReadiness', () => {
  it('pronto quando só bloqueio é janela horária', () => {
    const r = assessManualGenerateReadiness(
      baseDiagnosis({
        job: {
          subscription_id: 'sub-1',
          cycle_key: '2026-07-01',
          db_eligible: false,
          window_eligible: false,
          window_reason: 'future_local_date',
          window_diagnostic: null,
          predicted_insert: null,
          enqueue_row: null,
          can_attempt_insert: false,
          block_reason: 'future_local_date',
        },
      })
    );
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('bloqueia customer irrecuperável', () => {
    const r = assessManualGenerateReadiness(
      baseDiagnosis({
        customer: { customer_id: null, resolvable: false, resolved_via: null },
      })
    );
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('customer_unresolvable');
  });
});
