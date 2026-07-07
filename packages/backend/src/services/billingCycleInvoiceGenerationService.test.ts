import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateInvoiceForCycle,
  validateCycleForInvoiceGeneration,
} from './billingCycleInvoiceGenerationService.js';
import * as operationalCompetencyResolver from './operationalCompetencyResolver.js';
import * as subscriptionCyclesQueryService from './subscriptionCyclesQueryService.js';
import * as billingManualRenewalService from './billingManualRenewalService.js';
import * as subscriptionCycleLifecycleService from './subscriptionCycleLifecycleService.js';
import type { SubscriptionCycleDbRow } from './subscriptionCyclesQueryService.js';

const actor = { user_id: 'u1', user_name: 'Op', ip: '127.0.0.1' };

function cycle(overrides: Partial<SubscriptionCycleDbRow> = {}): SubscriptionCycleDbRow {
  return {
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
    ...overrides,
  };
}

describe('billingCycleInvoiceGenerationService Sprint 4.2D', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(subscriptionCycleLifecycleService, 'repairInvoicedCyclesWithoutInvoice').mockResolvedValue({
      cycles_reopened: 0,
      cycle_ids: [],
      cycle_dates: [],
      jobs_reset: 0,
    });
  });

  it('generateInvoiceForCycle repara invariante antes de resolver ciclo', async () => {
    const repairSpy = vi
      .spyOn(subscriptionCycleLifecycleService, 'repairInvoicedCyclesWithoutInvoice')
      .mockResolvedValue({ cycles_reopened: 1, cycle_ids: ['cycle-jul'], cycle_dates: ['2026-07-01'], jobs_reset: 0 });
    vi.spyOn(operationalCompetencyResolver, 'resolveCycleForManualGeneration').mockResolvedValue({
      cycle: cycle({ id: 'cycle-jul' }),
    });
    vi.spyOn(billingManualRenewalService, 'manualGenerateRenewalNow').mockResolvedValue({
      success: true,
      job_id: 'job-1',
      invoice_id: 'inv-jul',
      invoice_number: 'F-1',
      gateway_status: 'pending',
      notification_sent: false,
      subscription_status: 'active',
      cycle_key: '2026-07-01',
      execution_mode: 'manual',
      duration_ms: 10,
      message: 'ok',
      result: 'completed',
      error_code: null,
      stage: 'COMPLETE',
      reason: 'completed',
      repaired_fields: [],
      logs: [],
      correlation_id: 'c1',
    });

    await generateInvoiceForCycle('t1', 'sub-1', actor, 'cycle-jul');

    expect(repairSpy).toHaveBeenCalledWith('t1', 'sub-1', {
      reason: 'pre_manual_generate_invariant_repair',
      cycleId: 'cycle-jul',
    });
  });

  it('validateCycleForInvoiceGeneration rejeita ciclo já faturado', () => {
    expect(validateCycleForInvoiceGeneration(cycle({ invoice_id: 'inv-1' }))).toMatch(/já possui/);
  });

  it('validateCycleForInvoiceGeneration aceita ciclo skipped sem invoice', () => {
    expect(validateCycleForInvoiceGeneration(cycle({ status: 'skipped' }))).toBeNull();
  });

  it('generateInvoiceForCycle usa cycle_date do ciclo solicitado, não next_billing_date', async () => {
    vi.spyOn(operationalCompetencyResolver, 'resolveCycleForManualGeneration').mockResolvedValue({
      cycle: cycle({ id: 'cycle-jul', cycle_date: '2026-07-01' }),
    });
    const manualSpy = vi.spyOn(billingManualRenewalService, 'manualGenerateRenewalNow').mockResolvedValue({
      success: true,
      job_id: 'job-1',
      invoice_id: 'inv-jul',
      invoice_number: 'F-1',
      gateway_status: 'pending',
      notification_sent: false,
      subscription_status: 'active',
      cycle_key: '2026-07-01',
      execution_mode: 'manual',
      duration_ms: 10,
      message: 'ok',
      result: 'completed',
      error_code: null,
      stage: 'COMPLETE',
      reason: 'completed',
      repaired_fields: [],
      logs: [],
      correlation_id: 'c1',
    });

    const result = await generateInvoiceForCycle('t1', 'sub-1', actor, 'cycle-jul');

    expect(manualSpy).toHaveBeenCalledWith('t1', 'sub-1', actor, {
      cycleId: 'cycle-jul',
      cycleKey: '2026-07-01',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });
    expect(result.success).toBe(true);
    expect(result.invoice_id).toBe('inv-jul');
  });

  it('sem cycle_id resolve via OCRE', async () => {
    vi.spyOn(operationalCompetencyResolver, 'resolveCycleForManualGeneration').mockResolvedValue({
      cycle: cycle({ id: 'cycle-jun', cycle_date: '2026-06-01' }),
    });
    const manualSpy = vi.spyOn(billingManualRenewalService, 'manualGenerateRenewalNow').mockResolvedValue({
      success: true,
      job_id: 'job-1',
      invoice_id: 'inv-jun',
      invoice_number: null,
      gateway_status: null,
      notification_sent: false,
      subscription_status: 'active',
      cycle_key: '2026-06-01',
      execution_mode: 'manual',
      duration_ms: 5,
      message: 'ok',
      result: 'completed',
      error_code: null,
      stage: 'COMPLETE',
      reason: 'completed',
      repaired_fields: [],
      logs: [],
      correlation_id: 'c2',
    });

    await generateInvoiceForCycle('t1', 'sub-1', actor);

    expect(manualSpy).toHaveBeenCalledWith(
      't1',
      'sub-1',
      actor,
      expect.objectContaining({ cycleId: 'cycle-jun', cycleKey: '2026-06-01' })
    );
  });

  it('retorna cycle_required quando não há ciclo elegível', async () => {
    vi.spyOn(operationalCompetencyResolver, 'resolveCycleForManualGeneration').mockResolvedValue({
      error: 'Nenhum ciclo elegível encontrado. Informe cycle_id ou aguarde a criação do ciclo.',
      result: 'cycle_required',
    });

    const result = await generateInvoiceForCycle('t1', 'sub-1', actor);

    expect(result.success).toBe(false);
    expect(result.result).toBe('cycle_required');
  });
});
