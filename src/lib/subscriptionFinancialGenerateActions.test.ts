import { describe, it, expect } from 'vitest';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import { cycleSupportsManualGenerate } from './operationalCompetencyResolver';
import { resolveInvoiceCapabilities } from './invoiceCapabilities';
import { historyRowShowsChargeAction } from './subscriptionRenewalRecovery';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';

const today = '2026-06-30';

function timelineRow(overrides: Partial<CrmSubscriptionTimelineRow> = {}): CrmSubscriptionTimelineRow {
  return {
    month_ref: '2026-07',
    cycle_label: 'Jul/26',
    cycle_subtitle: '',
    cycle_date: '2026-07-14',
    period_label: 'Jul/26',
    period_start: '2026-07-14',
    period_end: '2026-07-21',
    due_date: '2026-07-14',
    status_pt: 'Aguardando',
    operational_state: 'awaiting_generation',
    operational_state_pt: 'Aguardando geração',
    amount_cents: 11000,
    invoice_id: null,
    cycle_status: 'pending',
    cycle_id: 'c-jul',
    job_id: null,
    ...overrides,
  };
}

function detail(overrides: Partial<CrmSubscriptionDetailPayload> = {}): CrmSubscriptionDetailPayload {
  const timeline = overrides.timeline ?? [
    timelineRow({ cycle_id: 'c-jul', due_date: '2026-07-14' }),
    timelineRow({ cycle_id: 'c-oct', due_date: '2026-10-01', cycle_date: '2026-10-01' }),
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
      amount_cents: 11000,
      currency: 'BRL',
      billing_anchor_day: 14,
      billing_cycle_count: 2,
      billing_interval: 'weekly',
      status: 'active',
      next_billing_date: '2026-08-01',
      current_period_start: '2026-07-14',
      current_period_end: '2026-07-21',
      cancel_at_period_end: false,
      grace_period_days: 0,
      default_payment_method: null,
      users_count: null,
      gateway: 'mercadopago',
      last_job_at: null,
      created_by: null,
      created_at: '2026-01-30T10:00:00Z',
      updated_at: '2026-06-30T10:00:00Z',
      cycles_unlimited: true,
      max_cycles: null,
    },
    client_name: 'Cliente',
    plan_label: 'Semanal',
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
      next_generation_ymd: '2026-07-14',
      next_charge_ymd: '2026-08-01',
    },
    cycles_raw,
    cycles_read_enabled: cycles_raw.length > 0,
    tenant_billing: {
      recurring_invoice_generate_days_before_due: 0,
      recurring_generate_time_local: '08:00',
      timezone: 'America/Sao_Paulo',
    },
    recent_jobs: [],
    meta: { periodicity_label_pt: 'Semanal' },
    ...overrides,
  };
}

describe('Sprint 4.2J — Restore Deterministic Generate Actions', () => {
  it('cycleSupportsManualGenerate exige cycle_id e invoice_id null', () => {
    const d = detail();
    expect(cycleSupportsManualGenerate(d, 'c-jul')).toBe(true);
    expect(cycleSupportsManualGenerate(d, 'c-oct')).toBe(true);
    expect(cycleSupportsManualGenerate(d, null)).toBe(false);
    expect(cycleSupportsManualGenerate(d, 'inexistente')).toBe(false);
  });

  it('histórico exibe Gerar em toda competência sem invoice', () => {
    const store = createFinancialEventStore(detail(), today);
    const rows = store.getHistoryRows().filter((r) => r.canGenerateNow);
    const cycleIds = rows.map((r) => r.cycleId).sort();
    expect(cycleIds).toEqual(['c-jul', 'c-oct']);
    expect(historyRowShowsChargeAction(rows.find((r) => r.cycleId === 'c-jul')!, today)).toBe(true);
    expect(historyRowShowsChargeAction(rows.find((r) => r.cycleId === 'c-oct')!, today)).toBe(true);
  });

  it('ciclo com invoice não exibe Gerar', () => {
    const d = detail({
      timeline: [
        timelineRow({
          cycle_id: 'c-jul',
          invoice_id: 'inv-1',
          operational_state: 'generated',
          invoice_status: 'pending',
        }),
        timelineRow({ cycle_id: 'c-oct', due_date: '2026-10-01', cycle_date: '2026-10-01' }),
      ],
    });
    const store = createFinancialEventStore(d, today);
    const jul = store.getHistoryRows().find((r) => r.cycleId === 'c-jul');
    const oct = store.getHistoryRows().find((r) => r.cycleId === 'c-oct');
    expect(jul?.canGenerateNow).toBe(false);
    expect(oct?.canGenerateNow).toBe(true);
  });

  it('supportsGenerate false sem cycle_id', () => {
    expect(
      resolveInvoiceCapabilities({ eventType: 'upcoming_cycle', cycleId: null }).supportsGenerate
    ).toBe(false);
    expect(
      resolveInvoiceCapabilities({ eventType: 'upcoming_cycle', cycleId: 'c-jul' }).supportsGenerate
    ).toBe(true);
  });

  it('calendário mantém projeções sem cycle_id', () => {
    const store = createFinancialEventStore(detail({ cycles_raw: [], timeline: [] }), today);
    const projected = store.getCalendarEvents().filter((e) => e.isProjected);
    expect(projected.length).toBeGreaterThan(0);
    expect(projected.every((e) => !e.cycleId)).toBe(true);
  });
});
