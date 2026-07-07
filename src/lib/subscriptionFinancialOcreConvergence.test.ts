import { describe, expect, it } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import { billingCycleStatusLabel, billingStatusLabel } from './billingStatusPresentation';
import { resolveOperationalCompetency } from './operationalCompetencyResolver';
import { findCycleById } from './subscriptionCyclesSource';

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
      timelineRow({ cycle_id: 'c-jul', due_date: '2026-07-01' }),
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
    stats: { total_invoiced_cents: 0, total_paid_cents: 0, total_pending_cents: 0, charge_count: 0 },
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

describe('Sprint 5.0-23C OCRE UI convergence', () => {
  it('findCycleById está disponível via subscriptionCyclesSource', () => {
    const d = detail();
    expect(findCycleById(d, 'c-jul')?.id).toBe('c-jul');
  });

  it('status internos nunca aparecem na apresentação', () => {
    expect(billingCycleStatusLabel('pending')).toBe('Pendente');
    expect(billingCycleStatusLabel('queued')).toBe('Pendente');
    expect(billingCycleStatusLabel('failed')).toBe('Falhou');
    expect(billingCycleStatusLabel('cancelled')).toBe('Cancelada');
    expect(billingStatusLabel({ cycleStatus: 'pending' })).toBe('Pendente');
  });

  it('History — invoice apagada exibe botão gerar', () => {
    const d = detail({
      timeline: [timelineRow({ cycle_id: 'c-jul', invoice_id: null, cycle_status: 'pending' })],
    });
    const store = createFinancialEventStore(d, '2026-06-30');
    const row = store.getHistoryRows().find((r) => r.cycleId === 'c-jul');
    expect(row?.canGenerateNow).toBe(true);
    expect(row?.statusPt).not.toMatch(/pending|queued|failed/i);
  });

  it('History — toda competência sem invoice exibe Gerar', () => {
    const d = detail();
    const store = createFinancialEventStore(d, '2026-06-30');
    const jul = store.getHistoryRows().find((r) => r.cycleId === 'c-jul');
    const oct = store.getHistoryRows().find((r) => r.cycleId === 'c-oct');
    expect(jul?.canGenerateNow).toBe(true);
    expect(oct?.canGenerateNow).toBe(true);
  });

  it('History — projection sem botão gerar', () => {
    const store = createFinancialEventStore(detail({ timeline: [], cycles_raw: [] }), '2026-06-30');
    const resolved = resolveOperationalCompetency(store.detail, { mode: 'NEXT_GENERATE' });
    expect(resolved.canGenerate).toBe(false);
    expect(resolved.isProjected).toBe(true);
  });

  it('History — failed reprocessa via OCRE', () => {
    const d = detail({
      timeline: [
        timelineRow({
          cycle_id: 'c-fail',
          due_date: '2026-05-01',
          cycle_status: 'failed',
          operational_state: 'failed',
        }),
      ],
    });
    const store = createFinancialEventStore(d, '2026-06-30');
    const row = store.getHistoryRows().find((r) => r.cycleId === 'c-fail');
    const resolved = store.resolveCyclePresentation('c-fail', 'HISTORY');
    expect(resolved.canReprocess || resolved.canGenerate).toBe(true);
    expect(row?.statusPt).toBe('Falhou');
  });

  it('History — invoice existente abre, não gera', () => {
    const d = detail({
      timeline: [
        timelineRow({
          cycle_id: 'c-inv',
          invoice_id: 'inv-1',
          cycle_status: 'invoiced',
          operational_state: 'generated',
        }),
      ],
    });
    const store = createFinancialEventStore(d, '2026-06-30');
    const resolved = store.resolveCyclePresentation('c-inv', 'HISTORY');
    expect(resolved.canGenerate).toBe(false);
    expect(resolved.canOpen).toBe(true);
  });
});
