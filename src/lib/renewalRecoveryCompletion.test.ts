import { describe, it, expect, vi } from 'vitest';
import {
  assessManualGenerateUnblocked,
  type RenewalDiagnosis,
} from '../../packages/backend/src/services/renewalDiagnosisService.js';
import { normalizeBillingDate, normalizeBillingDateOrEmpty } from '../../packages/backend/src/utils/billingSafeDate.js';
import {
  historyRowChargeActionLabel,
  historyRowShowsChargeAction,
  isRecoverableCycleFailure,
  mapHistoryFinancialStatus,
  normalizeBillingDate as normalizeBillingDateFront,
} from './subscriptionRenewalRecovery';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import { resolveNextInvoiceExperience } from './subscriptionNextInvoice';

const today = '2026-06-30';

function diagnosis(overrides: Partial<RenewalDiagnosis> = {}): RenewalDiagnosis {
  return {
    subscription_id: 'sub-1',
    ready_to_bill: false,
    failure_reason: null,
    validation: {
      subscription_found: true,
      status: 'active',
      type: 'customer',
      tenant_id: 't1',
    },
    dates: {
      next_billing_date: '2026-07-14',
      next_billing_valid: true,
      current_period_start: '2026-07-07',
      current_period_start_valid: true,
      job_cycle_key: '2026-07-14',
    },
    customer: { customer_id: 'c1', resolvable: true, resolved_via: 'direct' },
    job: null,
    invoice: {
      template_resolvable: true,
      resolved_via: 'plan',
      lookup_attempts: [],
      reason: null,
    },
    billing_plan: { present: false, item_count: 0, reason: 'missing' },
    contract: { has_crm_contract: false, amount_cents: null, billing_interval: null },
    timeline: { enqueue_block_reason: 'failed_max_attempts', can_attempt_insert: false },
    cycle_invoice: { cycle_ymd: '2026-07-14', exists: false, invoice_id: null },
    ...overrides,
  };
}

describe('normalizeBillingDate backend', () => {
  it('accepts YMD', () => {
    expect(normalizeBillingDate('2026-07-14')).toBe('2026-07-14');
  });
  it('accepts ISO', () => {
    expect(normalizeBillingDate('2026-07-14T12:00:00Z')).toBe('2026-07-14');
  });
  it('parses Date.toString with year', () => {
    const raw = new Date('2026-06-30T12:00:00Z').toString();
    expect(normalizeBillingDate(raw)).toBe('2026-06-30');
  });
  it('rejects Tue Jun 30 without year', () => {
    expect(normalizeBillingDate('Tue Jun 30')).toBeNull();
    expect(normalizeBillingDateOrEmpty('Tue Jun 30')).toBe('');
  });
});

describe('assessManualGenerateUnblocked', () => {
  it('allows when worker failed_max_attempts', () => {
    const r = assessManualGenerateUnblocked(diagnosis());
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });
  it('blocks when invoice exists', () => {
    const r = assessManualGenerateUnblocked(
      diagnosis({ cycle_invoice: { cycle_ymd: '2026-07-14', exists: true, invoice_id: 'inv-1' } })
    );
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain('invoice_already_exists');
  });
  it('blocks inactive subscription', () => {
    const r = assessManualGenerateUnblocked(
      diagnosis({ validation: { subscription_found: true, status: 'paused', type: 'customer', tenant_id: 't1' } })
    );
    expect(r.ready).toBe(false);
  });
});

describe('failed → awaiting_generation (UX)', () => {
  it('recoverable failed maps to pendente', () => {
    expect(
      mapHistoryFinancialStatus(
        {
          operational_state: 'failed',
          invoice_id: null,
          due_date: '2026-07-14',
          cycle_date: '2026-07-14',
          cycle_status: 'failed',
        },
        today
      )
    ).toBe('pendente');
  });
  it('isRecoverableCycleFailure true for future failed', () => {
    expect(
      isRecoverableCycleFailure(
        { operational_state: 'failed', invoice_id: null, due_date: '2026-07-14', cycle_date: '2026-07-14', cycle_status: 'failed' },
        today
      )
    ).toBe(true);
  });
});

describe('history row charge action', () => {
  const row = (overrides: Partial<FinancialHistoryRow> = {}): FinancialHistoryRow => ({
    id: 'r1',
    competence: 'Jul/26',
    amountCents: 11000,
    dueYmd: '2026-07-14',
    paidAt: null,
    statusPt: 'Pendente',
    gateway: null,
    invoiceId: null,
    visual: 'future',
    notes: null,
    jobId: null,
    ...overrides,
  });

  it('shows Gerar agora only when canGenerateNow', () => {
    expect(historyRowShowsChargeAction(row())).toBe(false);
    expect(historyRowShowsChargeAction(row({ canGenerateNow: true }))).toBe(true);
    expect(historyRowChargeActionLabel(row({ canGenerateNow: true }))).toBe('Gerar agora');
  });
  it('hides action when invoice exists', () => {
    expect(historyRowShowsChargeAction(row({ invoiceId: 'inv-1' }))).toBe(false);
  });
});

describe('next invoice preview', () => {
  it('has no action in experience object for UI', () => {
    const next = resolveNextInvoiceExperience(
      {
        subscription: {
          id: 's1',
          type: 'crm',
          tenant_id: 't1',
          customer_id: 'c1',
          plan_id: null,
          amount_cents: 11000,
          currency: 'BRL',
          billing_anchor_day: 14,
          billing_cycle_count: 1,
          billing_interval: 'weekly',
          status: 'active',
          next_billing_date: '2026-07-14',
          current_period_start: '2026-07-14',
          current_period_end: '2026-07-21',
          cancel_at_period_end: false,
          grace_period_days: 0,
          default_payment_method: null,
          users_count: null,
          gateway: null,
          last_job_at: null,
          created_by: null,
          created_at: '',
          updated_at: '',
        },
        client_name: null,
        plan_label: null,
        latest_invoice_id: null,
        latest_invoice_status: null,
        latest_paid_invoice_id: null,
        stats: { total_received_cents: 0, open_amount_cents: 0, charge_count: 0, paid_count: 0 },
        timeline: [
          {
            month_ref: '2026-07',
            cycle_label: 'Jul/26',
            cycle_subtitle: '',
            cycle_date: '2026-07-14',
            period_label: '',
            period_start: '2026-07-14',
            period_end: '2026-07-21',
            due_date: '2026-07-14',
            status_pt: 'Pendente',
            operational_state: 'awaiting_generation',
            operational_state_pt: 'Pendente',
            amount_cents: 11000,
            invoice_id: null,
            cycle_status: 'pending',
            cycle_id: 'c1',
            job_id: null,
          },
        ],
        automation_summary: {
          last_generation_at: null,
          last_generation_label: null,
          next_generation_ymd: '2026-07-14',
          next_charge_ymd: '2026-07-14',
        },
        cycles_raw: [],
        cycles_read_enabled: false,
        tenant_billing: {
          recurring_invoice_generate_days_before_due: 0,
          recurring_generate_time_local: null,
          timezone: null,
        },
        recent_jobs: [],
        meta: { periodicity_label_pt: 'Semanal' },
      },
      today
    );
    expect(next.statusLabel).toBe('Prevista');
    expect(next.hasInvoice).toBe(false);
  });
});

describe('frontend normalizeBillingDate alias', () => {
  it('matches backend rules', () => {
    expect(normalizeBillingDateFront('2026-07-14T00:00:00.000Z')).toBe('2026-07-14');
  });
});

describe('repair mock', () => {
  it('repair module exports', async () => {
    const mod = await import('../../packages/backend/src/services/subscriptionCycleRepairService.js');
    expect(typeof mod.repairRecoverableSubscriptionCycles).toBe('function');
    expect(typeof mod.repairCycle).toBe('function');
  });
});

describe('SQL date matrix', () => {
  const samples = [
    ['2026-01-15', '2026-01-15'],
    [new Date('2026-01-15T12:00:00Z'), '2026-01-15'],
  ] as const;
  it.each(samples)('normalizes %s', (input, expected) => {
    expect(normalizeBillingDate(input)).toBe(expected);
  });
});

describe('worker history isolation', () => {
  it('failed row status does not use Falhou when recoverable', () => {
    expect(
      mapHistoryFinancialStatus(
        { operational_state: 'failed', invoice_id: null, due_date: '2026-08-01', cycle_date: '2026-08-01', cycle_status: 'failed' },
        today
      )
    ).not.toBe('falhou');
  });
});

describe('status migration', () => {
  it('definitive past failed stays falhou', () => {
    expect(
      mapHistoryFinancialStatus(
        { operational_state: 'failed', invoice_id: null, due_date: '2026-04-01', cycle_date: '2026-04-01', cycle_status: 'failed' },
        today
      )
    ).toBe('falhou');
  });
});

describe('manual generation readiness edge cases', () => {
  it('ignores billing_plan missing', () => {
    const r = assessManualGenerateUnblocked(diagnosis({ billing_plan: { present: false, item_count: 0, reason: 'x' } }));
    expect(r.ready).toBe(true);
  });
  it('ignores customer unresolvable flag for manual path', () => {
    const r = assessManualGenerateUnblocked(
      diagnosis({ customer: { customer_id: null, resolvable: false, resolved_via: null } })
    );
    expect(r.ready).toBe(true);
  });
});
