import { describe, it, expect } from 'vitest';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import {
  buildSubscriptionFinancialEvents,
  resolveNextChargeEvent,
  resolveNextChargePresentation,
  hasFuturePredictedEvents,
} from './subscriptionFinancialEvents';
import { resolveNextChargePresentationFromStore } from './subscriptionFinancialEvents';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';

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
      next_billing_date: '2026-07-14',
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
      next_charge_ymd: '2026-07-14',
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

describe('subscriptionFinancialEvents — single source (cycles_raw)', () => {
  it('all financial events have cycle_id', () => {
    const events = buildSubscriptionFinancialEvents(detail(), today);
    expect(events.every((e) => Boolean(e.cycleId))).toBe(true);
  });

  it('history shows generate for every eligible real cycle', () => {
    const d = detail({
      timeline: [
        timelineRow({ cycle_id: 'c1', due_date: '2026-07-14' }),
        timelineRow({ cycle_id: 'c2', due_date: '2026-07-21', cycle_date: '2026-07-21' }),
        timelineRow({ cycle_id: 'c3', due_date: '2026-10-01', cycle_date: '2026-10-01' }),
      ],
    });
    const store = createFinancialEventStore(d, today);
    const withButton = store.getHistoryRows().filter((r) => r.canGenerateNow);
    expect(withButton.length).toBeGreaterThanOrEqual(3);
    expect(withButton.map((r) => r.cycleId).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('calendar and history share event collection', () => {
    const store = createFinancialEventStore(detail(), today);
    const calDates = new Set(store.getCalendarEvents().map((c) => c.ymd));
    const histDates = new Set(store.getHistoryRows().map((h) => h.dueYmd).filter(Boolean));
    for (const d of histDates) {
      expect(calDates.has(d!)).toBe(true);
    }
  });

  it('exactly one next charge highlight', () => {
    const store = createFinancialEventStore(detail(), today);
    const highlighted = store.getHistoryRows().filter((r) => r.isNextCharge);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.canGenerateNow).toBe(true);
  });

  it('card sidebar and history show same due date', () => {
    const store = createFinancialEventStore(detail(), today);
    const presentation = resolveNextChargePresentationFromStore(store);
    const highlighted = store.getHistoryRows().find((r) => r.isNextCharge);
    expect(presentation.dueYmd).toBe(highlighted?.dueYmd);
  });

  it('after invoicing first cycle, next charge advances to second cycle', () => {
    const d = detail({
      timeline: [
        timelineRow({
          cycle_id: 'c1',
          invoice_id: 'inv-1',
          operational_state: 'generated',
          invoice_status: 'pending',
        }),
        timelineRow({ cycle_id: 'c2', due_date: '2026-07-21', cycle_date: '2026-07-21' }),
      ],
      latest_invoice_id: 'inv-1',
    });
    const events = buildSubscriptionFinancialEvents(d, today);
    const next = resolveNextChargeEvent(events, d);
    expect(next?.cycleId).toBe('c2');
    expect(hasFuturePredictedEvents(events, d)).toBe(true);

    const store = createFinancialEventStore(d, today);
    const highlighted = store.getHistoryRows().find((r) => r.isNextCharge);
    expect(highlighted?.statusPt).toBe('Prevista');
    expect(highlighted?.invoiceId).toBeNull();
  });

  it('every eligible real cycle has generate in history', () => {
    const d = detail({
      timeline: [
        timelineRow({ cycle_id: 'c1', due_date: '2026-07-14' }),
        timelineRow({ cycle_id: 'c2', due_date: '2026-07-21', cycle_date: '2026-07-21' }),
      ],
    });
    const store = createFinancialEventStore(d, today);
    const withButton = store.getHistoryRows().filter((r) => r.canGenerateNow);
    expect(withButton).toHaveLength(2);
  });

  it('resolveNextChargePresentation uses cycles_raw not next_billing_date alone', () => {
    const events = buildSubscriptionFinancialEvents(detail(), today);
    const p = resolveNextChargePresentation(detail(), events, today);
    expect(p.statusLabel).toBe('Prevista');
    expect(p.hasInvoice).toBe(false);
    expect(p.cycleId).toBe('c1');
  });
});
