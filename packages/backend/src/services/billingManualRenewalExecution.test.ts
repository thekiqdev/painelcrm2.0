import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as recurringBillingJobService from './recurringBillingJobService.js';
import * as renewalDiagnosisService from './renewalDiagnosisService.js';
import * as billingNotificationFlush from './notificationsEngine/billingNotificationFlush.js';
import { manualRenewSubscription } from './billingManualRenewalService.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  withBillingWorkerRlsBypass: (fn: () => Promise<unknown>) => fn(),
}));

describe('billingManualRenewalExecution B0.2.1', () => {
  const actor = { user_id: 'u1', user_name: 'Op', ip: '127.0.0.1' };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(billingNotificationFlush, 'flushBillingNotificationSideEffects').mockResolvedValue({ drained: 1 });
  });

  it('manualRenewSubscription chama pipeline síncrono com manualExecution', async () => {
    vi.spyOn(renewalDiagnosisService, 'diagnoseRenewalForTenant').mockResolvedValue({
      subscription_id: 'sub-1',
      ready_to_bill: true,
      failure_reason: null,
      validation: { subscription_found: true, status: 'active', type: 'customer', tenant_id: 't1' },
      dates: {
        next_billing_date: '2026-07-01',
        next_billing_valid: true,
        current_period_start: '2026-06-01',
        current_period_start_valid: true,
        job_cycle_key: '2026-07-01',
      },
      customer: { customer_id: 'c1', resolvable: true, resolved_via: 'subscription_field' },
      job: null,
      invoice: { template_resolvable: true, resolved_via: 'persisted_plan', lookup_attempts: [], reason: null },
      billing_plan: { present: true, item_count: 1, reason: null },
      contract: { has_crm_contract: true, amount_cents: 1000, billing_interval: 'monthly' },
      timeline: { enqueue_block_reason: null, can_attempt_insert: true },
    });
    vi.spyOn(recurringBillingJobService, 'loadRenewalEnqueueJoinRow').mockResolvedValue({
      id: 'sub-1',
      tenant_id: 't1',
      status: 'active',
      type: 'customer',
      customer_id: 'c1',
      next_billing_date: '2026-07-01',
      billing_interval: 'monthly',
      current_period_start: '2026-06-01',
      cancel_at_period_end: false,
      recurring_invoice_generate_days_before_due: 0,
    } as Awaited<ReturnType<typeof recurringBillingJobService.loadRenewalEnqueueJoinRow>>);
    vi.spyOn(recurringBillingJobService, 'insertOrReactivateRenewalJob').mockResolvedValue('inserted');
    const execSpy = vi.spyOn(recurringBillingJobService, 'executeRenewalJobSynchronously').mockResolvedValue({
      processed: 1,
      failed: 0,
      cancelled: 0,
      job_id: 'job-1',
      invoice_id: 'inv-1',
      invoice_number: 'F-100',
      gateway_status: 'pending',
      completion_outcome: 'completed',
      error_message: null,
      cycle_key: '2026-07-01',
      job_status: 'completed',
    });

    const { pool } = await import('../utils/db.js');
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscriptions WHERE id')) {
        return { rows: [{ status: 'active' }] };
      }
      if (sql.includes('billing_recovery_audit')) {
        return { rows: [] };
      }
      if (sql.includes("status = 'processing'")) {
        return { rows: [] };
      }
      if (sql.includes('billing_recurring_jobs') && sql.includes('ORDER BY updated_at DESC')) {
        return { rows: [{ id: 'job-1' }] };
      }
      if (sql.includes('billing_recurring_jobs') && sql.includes("status = 'pending'")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await manualRenewSubscription('t1', 'sub-1', actor);

    expect(execSpy).toHaveBeenCalledWith(
      'job-1',
      expect.stringContaining('manual:u1'),
      { manualExecution: true }
    );
    expect(result.execution_mode).toBe('manual');
    expect(result.success).toBe(true);
    expect(result.invoice_id).toBe('inv-1');
    expect(result.invoice_number).toBe('F-100');
    expect(result.gateway_status).toBe('pending');
    expect(result.notification_sent).toBe(true);
    expect(result.cycle_key).toBe('2026-07-01');
  });

  it('bloqueia quando assinatura não está apta', async () => {
    vi.spyOn(renewalDiagnosisService, 'diagnoseRenewalForTenant').mockResolvedValue({
      subscription_id: 'sub-1',
      ready_to_bill: false,
      failure_reason: 'customer',
      validation: { subscription_found: true, status: 'active', type: 'customer', tenant_id: 't1' },
      dates: {
        next_billing_date: '2026-07-01',
        next_billing_valid: true,
        current_period_start: '2026-06-01',
        current_period_start_valid: true,
        job_cycle_key: '2026-07-01',
      },
      customer: { customer_id: null, resolvable: false, resolved_via: null },
      job: null,
      invoice: { template_resolvable: false, resolved_via: null, lookup_attempts: [], reason: 'BILLING_PLAN_NOT_FOUND' },
      billing_plan: { present: false, item_count: 0, reason: 'BILLING_PLAN_NOT_FOUND' },
      contract: { has_crm_contract: true, amount_cents: 1000, billing_interval: 'monthly' },
      timeline: { enqueue_block_reason: null, can_attempt_insert: false },
    });
    const execSpy = vi.spyOn(recurringBillingJobService, 'executeRenewalJobSynchronously');

    const result = await manualRenewSubscription('t1', 'sub-1', actor);

    expect(execSpy).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.result).toBe('not_ready');
    expect(result.execution_mode).toBe('manual');
  });
});
