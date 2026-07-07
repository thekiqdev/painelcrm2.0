import { describe, expect, it } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';
import {
  resolveOperationalCompetency,
  resolveFirstEligibleCycle,
  cycleSupportsManualGenerate,
} from './operationalCompetencyResolver';
import {
  resolveOperationalCompetencyFromContext,
  findFirstCompetencyGapDate,
} from './operationalCompetencyResolverCore';
import { advanceBillingDueYmd } from './billingSubscriptionExperience';

function timelineRow(overrides: Partial<CrmSubscriptionTimelineRow> = {}): CrmSubscriptionTimelineRow {
  return {
    month_ref: '2026-07',
    cycle_label: 'Jul/26',
    cycle_subtitle: '',
    cycle_date: '2026-07-01',
    period_label: 'Jul/26',
    period_start: '2026-07-01',
    period_end: '2026-08-01',
    due_date: '2026-07-01',
    status_pt: 'Aguardando',
    operational_state: 'awaiting_generation',
    operational_state_pt: 'Aguardando geração',
    amount_cents: 10000,
    invoice_id: null,
    cycle_status: 'pending',
    cycle_id: 'c-jul',
    job_id: null,
    ...overrides,
  };
}

function detail(overrides: Partial<CrmSubscriptionDetailPayload> = {}): CrmSubscriptionDetailPayload {
  const timeline =
    overrides.timeline ??
    [
      timelineRow({ cycle_id: 'c-jul', cycle_date: '2026-07-01', due_date: '2026-07-01' }),
      timelineRow({
        cycle_id: 'c-oct',
        cycle_date: '2026-10-01',
        due_date: '2026-10-01',
        month_ref: '2026-10',
      }),
    ];
  const cycles_raw =
    overrides.cycles_raw !== undefined ? overrides.cycles_raw : cyclesRawFromTimeline(timeline);
  return {
    subscription: {
      id: 'sub-1',
      type: 'crm',
      tenant_id: 't1',
      customer_id: 'c1',
      plan_id: 'plan-1',
      amount_cents: 10000,
      currency: 'BRL',
      billing_anchor_day: 1,
      billing_cycle_count: 2,
      billing_interval: 'monthly',
      status: 'active',
      next_billing_date: '2026-11-01',
      current_period_start: '2026-07-01',
      current_period_end: '2026-08-01',
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: null,
      users_count: null,
      gateway: 'mercadopago',
      last_job_at: null,
      created_by: null,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-06-30T10:00:00Z',
      cycles_unlimited: true,
      max_cycles: null,
      ...(overrides.subscription ?? {}),
    },
    client_name: 'Cliente',
    plan_label: 'Mensal',
    latest_invoice_id: null,
    latest_invoice_status: null,
    latest_paid_invoice_id: null,
    stats: {
      total_invoiced_cents: 0,
      total_paid_cents: 0,
      total_pending_cents: 0,
      charge_count: 0,
    },
    timeline,
    automation_summary: {
      last_generation_at: null,
      last_generation_label: null,
      next_generation_ymd: '2026-07-01',
      next_charge_ymd: '2026-11-01',
    },
    cycles_raw,
    cycles_read_enabled: cycles_raw.length > 0,
    tenant_billing: {
      recurring_invoice_generate_days_before_due: 0,
      recurring_generate_time_local: '08:00',
      timezone: 'America/Sao_Paulo',
    },
    recent_jobs: [],
    meta: { periodicity_label_pt: 'Mensal' },
    ...overrides,
  };
}

const advanceMonthly = (d: string) => advanceBillingDueYmd(d, 'monthly');

describe('operationalCompetencyResolver Sprint 5.0-23B', () => {
  it('caso 1 — invoice apagada: Julho invoice NULL → Generate Julho', () => {
    const d = detail({
      timeline: [
        timelineRow({
          cycle_id: 'c-jul',
          invoice_id: null,
          cycle_status: 'pending',
        }),
      ],
    });
    const r = resolveOperationalCompetency(d, { mode: 'NEXT_GENERATE' });
    expect(r.cycleId).toBe('c-jul');
    expect(r.resolution).toBe('READY_TO_GENERATE');
    expect(r.canGenerate).toBe(true);
  });

  it('caso 2 — Julho aberto e Agosto faturado → Julho', () => {
    const d = detail({
      timeline: [
        timelineRow({ cycle_id: 'c-jul', cycle_date: '2026-07-01', due_date: '2026-07-01' }),
        timelineRow({
          cycle_id: 'c-aug',
          cycle_date: '2026-08-01',
          due_date: '2026-08-01',
          month_ref: '2026-08',
          invoice_id: 'inv-aug',
          cycle_status: 'invoiced',
          operational_state: 'generated',
        }),
      ],
    });
    const r = resolveOperationalCompetency(d, { mode: 'NEXT_GENERATE' });
    expect(r.cycleId).toBe('c-jul');
  });

  it('caso 3 — gap Jul/Out sem Ago → competência Agosto (materialização)', () => {
    const d = detail({
      timeline: [
        timelineRow({
          cycle_id: 'c-jul',
          cycle_date: '2026-07-01',
          due_date: '2026-07-01',
          invoice_id: 'inv-jul',
          cycle_status: 'invoiced',
        }),
        timelineRow({
          cycle_id: 'c-oct',
          cycle_date: '2026-10-01',
          due_date: '2026-10-01',
          month_ref: '2026-10',
        }),
      ],
    });
    const r = resolveOperationalCompetency(d, { mode: 'NEXT_GENERATE' });
    expect(r.dueDate).toBe('2026-08-01');
    expect(r.resolution).toBe('WAITING_MATERIALIZATION');
  });

  it('caso 4 — projection only sem cycles', () => {
    const r = resolveOperationalCompetency(detail({ timeline: [], cycles_raw: [] }), {
      mode: 'NEXT_GENERATE',
    });
    expect(r.resolution).toBe('PROJECTION_ONLY');
    expect(r.canGenerate).toBe(false);
    expect(r.reason).toBe('projection_only');
  });

  it('caso 5 — invoice existente → open não generate', () => {
    const d = detail({
      timeline: [
        timelineRow({
          cycle_id: 'c-jul',
          invoice_id: 'inv-1',
          cycle_status: 'invoiced',
        }),
      ],
    });
    const r = resolveOperationalCompetency(d, {
      mode: 'SPECIFIC_CYCLE',
      preferredCycleId: 'c-jul',
    });
    expect(r.canGenerate).toBe(false);
    expect(r.canOpen).toBe(true);
    expect(r.resolution).toBe('READY_TO_OPEN');
  });

  it('caso 7 — cancelled cycle status ainda gera', () => {
    const d = detail({
      timeline: [timelineRow({ cycle_id: 'c-jul', cycle_status: 'cancelled' })],
    });
    const r = resolveOperationalCompetency(d, { mode: 'NEXT_GENERATE' });
    expect(r.canGenerate).toBe(true);
  });

  it('HISTORY — toda competência sem invoice exibe Gerar (Sprint 5.0-23F)', () => {
    const d = detail();
    expect(cycleSupportsManualGenerate(d, 'c-jul')).toBe(true);
    expect(cycleSupportsManualGenerate(d, 'c-oct')).toBe(true);
  });

  it('resolveFirstEligibleCycle delega ao OCRE', () => {
    expect(resolveFirstEligibleCycle(detail())?.id).toBe('c-jul');
  });

  it('gap detection core — mensal', () => {
    const gap = findFirstCompetencyGapDate(
      [
        { id: 'c-jul', cycle_date: '2026-07-01', status: 'invoiced', invoice_id: 'inv' },
        { id: 'c-oct', cycle_date: '2026-10-01', status: 'pending', invoice_id: null },
      ],
      advanceMonthly
    );
    expect(gap).toBe('2026-08-01');
  });

  it('subscription cancelada', () => {
    const r = resolveOperationalCompetencyFromContext(
      {
        subscriptionId: 'sub-1',
        subscriptionStatus: 'cancelled',
        billingInterval: 'monthly',
        cycles: [],
      },
      { subscriptionId: 'sub-1', mode: 'NEXT_GENERATE' },
      advanceMonthly
    );
    expect(r.resolution).toBe('SUBSCRIPTION_CANCELLED');
  });
});
