import { describe, it, expect } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import {
  buildProjectionEvents,
  isProjectedFinancialEvent,
  mergeRealAndProjectionEvents,
  occupiedDueDatesFromDetail,
  PROJECTION_MAX_COUNT,
  resolveFirstProjectedEvent,
} from './subscriptionFinancialProjection';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';
import { executeDeterministicGenerateRenewal } from './subscriptionBillingGeneration';

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
    cycle_id: 'c1',
    job_id: null,
    ...overrides,
  };
}

function detail(overrides: Partial<CrmSubscriptionDetailPayload> = {}): CrmSubscriptionDetailPayload {
  const timeline = overrides.timeline ?? [timelineRow()];
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

describe('subscriptionFinancialProjection — Sprint 4.2H', () => {
  it('ProjectionEvents nunca possuem cycle_id', () => {
    const projected = buildProjectionEvents(detail({ cycles_raw: [], timeline: [] }), today);
    expect(projected.length).toBeGreaterThan(0);
    expect(projected.every((e) => e.cycleId == null)).toBe(true);
    expect(projected.every(isProjectedFinancialEvent)).toBe(true);
  });

  it('gera até 12 competências projetadas', () => {
    const projected = buildProjectionEvents(detail({ cycles_raw: [], timeline: [] }), today, PROJECTION_MAX_COUNT);
    expect(projected).toHaveLength(PROJECTION_MAX_COUNT);
  });

  it('descarta projeção quando competência existe em cycles_raw', () => {
    const d = detail({
      timeline: [timelineRow({ cycle_id: 'c1', due_date: '2026-08-01', cycle_date: '2026-08-01' })],
    });
    const occupied = occupiedDueDatesFromDetail(d);
    expect(occupied.has('2026-08-01')).toBe(true);
    const real = buildFinancialEvents(d, today);
    const projected = buildProjectionEvents(d, today);
    const merged = mergeRealAndProjectionEvents(real, projected);
    expect(merged.some((e) => isProjectedFinancialEvent(e) && e.dueYmd === '2026-08-01')).toBe(false);
  });

  it('eventos reais têm prioridade no mesmo dueYmd', () => {
    const d = detail();
    const real = buildFinancialEvents(d, today);
    const projected = buildProjectionEvents(d, today);
    const merged = mergeRealAndProjectionEvents(real, projected);
    for (const r of real) {
      const due = r.dueYmd ?? r.ymd;
      const dup = merged.filter((e) => (e.dueYmd ?? e.ymd) === due);
      expect(dup.some((e) => e.kind === 'real')).toBe(true);
      expect(dup.filter(isProjectedFinancialEvent)).toHaveLength(0);
    }
  });

  it('calendário inclui projeções', () => {
    const store = createFinancialEventStore(detail({ cycles_raw: [], timeline: [] }), today);
    const future = store.getCalendarEvents().filter((e) => e.isProjected);
    expect(future.length).toBeGreaterThan(0);
  });

  it('histórico não inclui projeções — apenas ciclos reais', () => {
    const store = createFinancialEventStore(detail({ cycles_raw: [], timeline: [] }), today);
    expect(store.getHistoryRows().filter((r) => r.isProjected)).toHaveLength(0);
  });

  it('NextInvoiceCard usa projeção quando não há ciclo real elegível', () => {
    const store = createFinancialEventStore(
      detail({
        cycles_raw: [],
        timeline: [],
        subscription: { ...detail().subscription, next_billing_date: '2026-08-01' },
      }),
      today
    );
    const presentation = store.getNextChargePresentation();
    expect(presentation.isProjected).toBe(true);
    expect(presentation.cycleId).toBeNull();
    expect(presentation.dueYmd).toBeTruthy();
  });

  it('NextInvoice usa ciclo real quando existe', () => {
    const store = createFinancialEventStore(detail(), today);
    const presentation = store.getNextChargePresentation();
    expect(presentation.isProjected).toBeFalsy();
    expect(presentation.cycleId).toBe('c1');
  });

  it('resolveFirstProjectedEvent retorna primeira futura', () => {
    const store = createFinancialEventStore(detail({ cycles_raw: [], timeline: [] }), today);
    const first = resolveFirstProjectedEvent(store.events, today);
    expect(first).not.toBeNull();
    expect(isProjectedFinancialEvent(first!)).toBe(true);
  });

  it('billing continua exigindo cycle_id — projeção não gera', async () => {
    const result = await executeDeterministicGenerateRenewal({
      subscriptionId: 'sub-1',
      detail: detail({ cycles_raw: [], timeline: [] }),
      target: { cycleId: '', componentName: 'Test' },
      componentName: 'Test',
    });
    expect(result.error_code).toBe('CYCLE_ID_REQUIRED');
  });

  it('realEvents do store não incluem projeções', () => {
    const store = createFinancialEventStore(detail({ cycles_raw: [], timeline: [] }), today);
    expect(store.realEvents.every((e) => e.kind === 'real' || e.cycleId != null)).toBe(true);
    expect(store.realEvents.some(isProjectedFinancialEvent)).toBe(false);
  });
});
