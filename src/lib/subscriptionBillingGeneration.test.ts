import { describe, it, expect, vi } from 'vitest';
import {
  resolveGenerateBillingCycleId,
  executeDeterministicGenerateRenewal,
} from './subscriptionBillingGeneration';
import { resolveFirstEligibleCycle } from './operationalCompetencyResolver';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';

function detail(overrides: Partial<CrmSubscriptionDetailPayload> = {}): CrmSubscriptionDetailPayload {
  return {
    subscription: {
      id: 'sub-1',
      status: 'active',
      amount_cents: 10000,
      billing_interval: 'monthly',
      next_billing_date: '2026-09-01',
      current_period_start: '2026-08-01',
      current_period_end: '2026-08-31',
      billing_cycle_count: 2,
      billing_anchor_day: 1,
      customer_id: 'c1',
      cycles_unlimited: true,
      max_cycles: null,
    },
    client_name: 'Cliente',
    latest_invoice_id: null,
    latest_invoice_status: null,
    latest_paid_invoice_id: null,
    stats: { mrr_cents: 10000, total_invoiced_cents: 0, total_paid_cents: 0, open_invoices: 0 },
    timeline: [
      {
        cycle_id: 'cycle-jul',
        cycle_date: '2026-07-01',
        due_date: '2026-07-01',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
        operational_state: 'awaiting_generation',
        cycle_status: 'pending',
        amount_cents: 10000,
        invoice_id: null,
        invoice_status: null,
        paid_at: null,
        gateway: null,
        cycle_label: 'Jul/2026',
        cycle_subtitle: '',
        job_id: null,
        notes: null,
      },
      {
        cycle_id: 'cycle-aug',
        cycle_date: '2026-08-01',
        due_date: '2026-08-01',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        operational_state: 'awaiting_generation',
        cycle_status: 'pending',
        amount_cents: 10000,
        invoice_id: null,
        invoice_status: null,
        paid_at: null,
        gateway: null,
        cycle_label: 'Ago/2026',
        cycle_subtitle: '',
        job_id: null,
        notes: null,
      },
    ],
    automation_summary: { jobs_pending: 0, jobs_failed: 0, last_job_at: null },
    cycles_raw: [
      {
        id: 'cycle-jul',
        cycle_date: '2026-07-01',
        period_start: '2026-07-01',
        period_end: '2026-07-31',
        status: 'pending',
        invoice_id: null,
        job_id: null,
        processed_at: null,
        skipped_reason: null,
        error_message: null,
      },
      {
        id: 'cycle-aug',
        cycle_date: '2026-08-01',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        status: 'pending',
        invoice_id: null,
        job_id: null,
        processed_at: null,
        skipped_reason: null,
        error_message: null,
      },
    ],
    cycles_read_enabled: true,
    tenant_billing: { recurring_invoice_generate_days_before_due: 0 },
    recent_jobs: [],
    meta: { periodicity_label_pt: 'Mensal' },
    ...overrides,
  } as CrmSubscriptionDetailPayload;
}

describe('subscriptionBillingGeneration', () => {
  it('prioriza cycleId do target', () => {
    expect(resolveGenerateBillingCycleId({ cycleId: 'c1' }, 'c2')).toBe('c1');
  });

  it('resolveFirstEligibleCycle retorna Julho antes de Agosto', () => {
    const hit = resolveFirstEligibleCycle(detail());
    expect(hit?.id).toBe('cycle-jul');
    expect(hit?.cycle_date).toBe('2026-07-01');
  });

  it('clique explícito em Julho envia cycle-jul independente de next_billing_date', () => {
    const cycleId = resolveGenerateBillingCycleId({
      cycleId: 'cycle-jul',
      dueYmd: '2026-07-01',
      componentName: 'FinancialCalendarPopover',
    });
    expect(cycleId).toBe('cycle-jul');
  });

  it('sem cycle_id explícito a geração é bloqueada', async () => {
    const result = await executeDeterministicGenerateRenewal({
      subscriptionId: 'sub-1',
      detail: detail(),
      componentName: 'Test',
    });
    expect(result.success).toBe(false);
    expect(result.error_code).toBe('CYCLE_ID_REQUIRED');
  });
});

describe('executeDeterministicGenerateRenewal', () => {
  it('envia cycle_id no payload da API', async () => {
    const spy = vi.spyOn(
      (await import('@/services/crmSubscriptions')).crmSubscriptionsService,
      'generateRenewalNow'
    ).mockResolvedValue({
      success: true,
      job_id: 'j1',
      invoice_id: 'inv1',
      invoice_number: null,
      gateway_status: null,
      notification_sent: false,
      subscription_status: 'active',
      cycle_key: '2026-07-01',
      execution_mode: 'manual',
      duration_ms: 1,
      message: 'ok',
      result: 'completed',
      repaired_fields: [],
      logs: [],
    });

    await executeDeterministicGenerateRenewal({
      subscriptionId: 'sub-1',
      detail: detail(),
      target: { cycleId: 'cycle-jul', dueYmd: '2026-07-01', componentName: 'FinancialHistoryRow' },
      componentName: 'FinancialHistoryRow',
    });

    expect(spy).toHaveBeenCalledWith('sub-1', { cycleId: 'cycle-jul' });
    spy.mockRestore();
  });
});
