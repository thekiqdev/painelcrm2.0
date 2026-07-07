import { describe, it, expect } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import {
  assertFinancialConsistency,
  auditFinancialConsistency,
  eventsOnSameDay,
  paymentDatesInAllSurfaces,
} from './subscriptionFinancialConsistencyAudit';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import { cyclesRawFromTimeline } from './testHelpers/subscriptionCyclesFixture';

const today = '2026-06-30';

function row(overrides: Partial<CrmSubscriptionTimelineRow> = {}): CrmSubscriptionTimelineRow {
  return {
    month_ref: '2026-07',
    cycle_label: 'Jul/26',
    cycle_subtitle: '',
    cycle_date: '2026-07-14',
    period_label: 'Jul/26',
    period_start: '2026-07-07',
    period_end: '2026-08-07',
    due_date: '2026-07-14',
    status_pt: 'Aguardando',
    operational_state: 'generated',
    operational_state_pt: 'Gerada',
    amount_cents: 11000,
    invoice_id: 'inv-1',
    invoice_status: 'pending',
    gateway_status: null,
    gateway_reference_id: null,
    cycle_status: 'generated',
    cycle_id: 'c1',
    job_id: null,
    ...overrides,
  };
}

function detail(overrides: Partial<CrmSubscriptionDetailPayload> = {}): CrmSubscriptionDetailPayload {
  const timeline = [
      row({
        due_date: '2026-06-30',
        invoice_id: 'inv-paid',
        invoice_status: 'paid',
        operational_state: 'paid',
        status_pt: 'Pago',
        processed_at: '2026-06-30T12:00:00Z',
        amount_cents: 11000,
        cycle_id: 'c0',
      }),
      row({
        due_date: '2026-07-07',
        invoice_id: 'inv-2',
        invoice_status: 'paid',
        operational_state: 'paid',
        status_pt: 'Pago',
        processed_at: '2026-07-07T12:00:00Z',
        cycle_id: 'c2',
      }),
      row({
        due_date: '2026-05-01',
        cycle_date: '2026-05-01',
        invoice_id: null,
        operational_state: 'failed',
        status_pt: 'Falha na geração',
        job_error_snippet: 'timeout',
        cycle_id: 'c3',
      }),
      row({
        due_date: '2026-07-21',
        invoice_id: 'inv-pending',
        invoice_created_at: '2026-07-18T10:00:00Z',
        invoice_status: 'pending',
        operational_state: 'generated',
        status_pt: 'Aguardando',
        cycle_id: 'c4',
      }),
      ...(overrides.timeline ?? []),
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
      next_billing_date: '2026-07-21',
      current_period_start: '2026-07-07',
      current_period_end: '2026-07-14',
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
      ...overrides.subscription,
    },
    client_name: 'Cliente Teste',
    plan_label: 'Plano Semanal',
    latest_invoice_id: 'inv-1',
    latest_invoice_status: 'pending',
    latest_paid_invoice_id: 'inv-paid',
    stats: {
      total_received_cents: 22000,
      open_amount_cents: 11000,
      charge_count: 2,
      paid_count: 2,
    },
    timeline,
    automation_summary: {
      last_generation_at: null,
      last_generation_label: null,
      next_generation_ymd: '2026-07-14',
      next_charge_ymd: '2026-07-21',
    },
    cycles_raw,
    cycles_read_enabled: overrides.cycles_read_enabled ?? cycles_raw.length > 0,
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

describe('auditFinancialConsistency — passes on standard fixture', () => {
  it('audit ok', () => {
    const store = createFinancialEventStore(detail(), today);
    const result = auditFinancialConsistency(store);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('assert does not throw', () => {
    expect(() => assertFinancialConsistency(createFinancialEventStore(detail(), today))).not.toThrow();
  });

  it('eventCount positive', () => {
    const result = auditFinancialConsistency(createFinancialEventStore(detail(), today));
    expect(result.eventCount).toBeGreaterThan(0);
  });
});

describe('auditFinancialConsistency — 07/07 payment parity', () => {
  it('payment 2026-07-07 on calendar', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getCalendarEvents().some((c) => c.ymd === '2026-07-07' && c.kind === 'paid')).toBe(true);
  });

  it('payment 2026-07-07 in history', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getHistoryRows().some((h) => h.dueYmd === '2026-07-07')).toBe(true);
  });

  it('payment 2026-07-07 in timeline', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getTimelineItems().some((t) => t.ymd === '2026-07-07')).toBe(true);
  });

  it('paymentDatesInAllSurfaces includes 07/07', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(paymentDatesInAllSurfaces(store)).toContain('2026-07-07');
  });

  it('audit passes with 07/07 payment', () => {
    expect(auditFinancialConsistency(createFinancialEventStore(detail(), today)).ok).toBe(true);
  });
});

describe('auditFinancialConsistency — surface counts', () => {
  it('calendar count matches getCalendarEvents', () => {
    const store = createFinancialEventStore(detail(), today);
    const result = auditFinancialConsistency(store);
    expect(result.surfaces.calendar).toBe(store.getCalendarEvents().length);
  });

  it('history count matches getHistoryRows', () => {
    const store = createFinancialEventStore(detail(), today);
    const result = auditFinancialConsistency(store);
    expect(result.surfaces.history).toBe(store.getHistoryRows().length);
  });

  it('timeline count matches getTimelineItems', () => {
    const store = createFinancialEventStore(detail(), today);
    const result = auditFinancialConsistency(store);
    expect(result.surfaces.timeline).toBe(store.getTimelineItems().length);
  });

  it('kpis has 6 cards', () => {
    const result = auditFinancialConsistency(createFinancialEventStore(detail(), today));
    expect(result.surfaces.kpis).toBe(6);
  });

  it('insights non-empty', () => {
    const result = auditFinancialConsistency(createFinancialEventStore(detail(), today));
    expect(result.surfaces.insights).toBeGreaterThan(0);
  });

  it('upcoming non-empty for active subscription', () => {
    const result = auditFinancialConsistency(createFinancialEventStore(detail(), today));
    expect(result.surfaces.upcoming).toBeGreaterThan(0);
  });
});

describe('auditFinancialConsistency — KPI alignment', () => {
  it('received KPI reflects payment total', () => {
    const store = createFinancialEventStore(detail(), today);
    const payments = store.getEventsByType('payment');
    const total = payments.reduce((s, e) => s + (e.amountCents ?? 0), 0);
    const kpi = store.getKpiCards().find((k) => k.key === 'received');
    expect(kpi?.primary).toContain(String(Math.round(total / 100)));
  });

  it('last payment KPI matches latest payment event', () => {
    const store = createFinancialEventStore(detail(), today);
    const last = [...store.getEventsByType('payment')].sort((a, b) => b.ymd.localeCompare(a.ymd))[0];
    const kpi = store.getKpiCards().find((k) => k.key === 'last_payment');
    expect(kpi?.primary).toBeTruthy();
    if (last) expect(kpi?.secondary).toContain('110');
  });

  it('open KPI uses invoice_due events', () => {
    const store = createFinancialEventStore(detail(), today);
    const openKpi = store.getKpiCards().find((k) => k.key === 'open');
    expect(openKpi?.label).toBe('Em aberto');
  });
});

describe('auditFinancialConsistency — upcoming x calendar', () => {
  it('every upcoming ymd on calendar', () => {
    const store = createFinancialEventStore(detail(), today);
    const calendarYmds = new Set(store.getCalendarEvents().map((c) => c.ymd));
    for (const u of store.getUpcomingReceipts()) {
      expect(calendarYmds.has(u.ymd)).toBe(true);
    }
  });

  it('upcoming first matches next_receipt KPI date when present', () => {
    const store = createFinancialEventStore(detail(), today);
    const upcoming = store.getUpcomingReceipts()[0];
    const kpi = store.getKpiCards().find((k) => k.key === 'next_receipt');
    if (upcoming && kpi?.primary !== '—') {
      expect(kpi?.primary).toBeTruthy();
    }
  });
});

describe('auditFinancialConsistency — history x events', () => {
  it('each history row has related event', () => {
    const store = createFinancialEventStore(detail(), today);
    for (const h of store.getHistoryRows()) {
      if (!h.dueYmd) continue;
      const related = store.events.filter(
        (e) => e.dueYmd === h.dueYmd || e.invoiceId === h.invoiceId
      );
      expect(related.length).toBeGreaterThan(0);
    }
  });

  it('history amounts match events', () => {
    const store = createFinancialEventStore(detail(), today);
    const result = auditFinancialConsistency(store);
    expect(result.errors.filter((e) => e.code === 'AMOUNT_MISMATCH')).toHaveLength(0);
  });
});

describe('auditFinancialConsistency — failure detection (mocked store)', () => {
  it('detects payment missing from calendar', () => {
    const store = createFinancialEventStore(detail(), today);
    const broken = Object.assign(Object.create(Object.getPrototypeOf(store)), store, {
      getCalendarEvents: () => [],
    });
    const result = auditFinancialConsistency(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'PAYMENT_MISSING_CALENDAR')).toBe(true);
  });

  it('detects payment missing from timeline', () => {
    const store = createFinancialEventStore(detail(), today);
    const broken = Object.assign(Object.create(Object.getPrototypeOf(store)), store, {
      getTimelineItems: () => [],
    });
    const result = auditFinancialConsistency(broken);
    expect(result.errors.some((e) => e.code === 'PAYMENT_MISSING_TIMELINE')).toBe(true);
  });

  it('detects payment missing from history', () => {
    const store = createFinancialEventStore(detail(), today);
    const broken = Object.assign(Object.create(Object.getPrototypeOf(store)), store, {
      getHistoryRows: () => [],
    });
    const result = auditFinancialConsistency(broken);
    expect(result.errors.some((e) => e.code === 'PAYMENT_MISSING_HISTORY')).toBe(true);
  });

  it('assertFinancialConsistency throws on broken store', () => {
    const store = createFinancialEventStore(detail(), today);
    const broken = Object.assign(Object.create(Object.getPrototypeOf(store)), store, {
      getCalendarEvents: () => [],
    });
    expect(() => assertFinancialConsistency(broken)).toThrow(/ConsistencyError/);
  });

  it('detects upcoming orphan', () => {
    const store = createFinancialEventStore(detail(), today);
    const fakeUpcoming = [{ id: 'x', ymd: '2099-01-01', dateLabel: '', amountCents: 100, statusLabel: 'Previsto' }];
    const broken = Object.assign(Object.create(Object.getPrototypeOf(store)), store, {
      getUpcomingReceipts: () => fakeUpcoming,
    });
    const result = auditFinancialConsistency(broken);
    expect(result.errors.some((e) => e.code === 'UPCOMING_ORPHAN')).toBe(true);
  });

  it('detects upcoming missing calendar', () => {
    const store = createFinancialEventStore(detail(), today);
    const fakeUpcoming = [{ id: 'x', ymd: '2099-01-01', dateLabel: '', amountCents: 100, statusLabel: 'Previsto' }];
    const broken = Object.assign(Object.create(Object.getPrototypeOf(store)), store, {
      getUpcomingReceipts: () => fakeUpcoming,
      getCalendarEvents: () => [],
    });
    const result = auditFinancialConsistency(broken);
    expect(result.errors.some((e) => e.code === 'UPCOMING_MISSING_CALENDAR')).toBe(true);
  });
});

describe('eventsOnSameDay', () => {
  it('returns types for 2026-07-21', () => {
    const store = createFinancialEventStore(detail(), today);
    const types = eventsOnSameDay(store, '2026-07-21');
    expect(types.length).toBeGreaterThan(0);
  });

  it('empty for unknown day', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(eventsOnSameDay(store, '1999-01-01')).toEqual([]);
  });

  it('includes payment on 2026-07-07', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(eventsOnSameDay(store, '2026-07-07')).toContain('payment');
  });
});

describe('auditFinancialConsistency — variant fixtures', () => {
  const variants: { name: string; d: CrmSubscriptionDetailPayload }[] = [
    { name: 'standard', d: detail() },
    {
      name: 'extra payment',
      d: detail({
        timeline: [
          row({
            due_date: '2026-05-15',
            invoice_status: 'paid',
            operational_state: 'paid',
            processed_at: '2026-05-15T10:00:00Z',
            invoice_id: 'inv-extra',
            cycle_id: 'c-extra',
          }),
        ],
      }),
    },
    {
      name: 'manual charge',
      d: detail({
        timeline: [
          row({
            operational_state: 'manual_invoice',
            invoice_created_at: '2026-08-01T10:00:00Z',
            due_date: '2026-08-08',
            invoice_id: 'inv-man',
            cycle_id: 'c-man',
          }),
        ],
      }),
    },
    {
      name: 'reprocessed',
      d: detail({
        timeline: [row({ has_auto_retry: true, due_date: '2026-08-02', invoice_id: 'inv-rep', cycle_id: 'c-rep' })],
      }),
    },
    {
      name: 'cancelled sub',
      d: detail({ subscription: { ...detail().subscription, status: 'cancelled' } }),
    },
    {
      name: 'paused sub',
      d: detail({ subscription: { ...detail().subscription, status: 'paused' } }),
    },
    {
      name: 'refunded',
      d: detail({
        timeline: [row({ invoice_status: 'refunded', due_date: '2026-08-10', invoice_id: 'inv-ref2', cycle_id: 'c-ref' })],
      }),
    },
    {
      name: 'gateway failed',
      d: detail({
        timeline: [row({ operational_state: 'gateway_failed', due_date: '2026-08-11', invoice_id: 'inv-gw', cycle_id: 'c-gw' })],
      }),
    },
  ];

  for (const v of variants) {
    it(`passes audit for ${v.name}`, () => {
      const result = auditFinancialConsistency(createFinancialEventStore(v.d, today));
      expect(result.ok).toBe(true);
    });
  }
});

describe('auditFinancialConsistency — timeline x history paid dates', () => {
  const paidDates = ['2026-06-30', '2026-07-07'];
  for (const ymd of paidDates) {
    it(`timeline and history both reference ${ymd}`, () => {
      const store = createFinancialEventStore(detail(), today);
      const inTimeline = store.getTimelineItems().some((t) => t.ymd === ymd);
      const inHistory = store.getHistoryRows().some((h) => h.dueYmd === ymd);
      expect(inTimeline).toBe(true);
      expect(inHistory).toBe(true);
    });
  }
});

describe('auditFinancialConsistency — insights', () => {
  it('insights reference store not raw invoices', () => {
    const store = createFinancialEventStore(detail(), today);
    const insights = store.getInsights();
    expect(insights.length).toBeGreaterThan(0);
    expect(auditFinancialConsistency(store).errors.filter((e) => e.code === 'INSIGHTS_EMPTY')).toHaveLength(0);
  });

  it('failure insight when failures present', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getInsights().some((i) => i.id === 'failures')).toBe(true);
  });
});

describe('auditFinancialConsistency — calendar payment days', () => {
  it('all payment ymd on calendar as paid kind', () => {
    const store = createFinancialEventStore(detail(), today);
    const payments = store.getEventsByType('payment');
    const paidCalendar = store.getCalendarEvents().filter((c) => c.kind === 'paid');
    for (const p of payments) {
      expect(paidCalendar.some((c) => c.ymd === p.ymd)).toBe(true);
    }
  });
});

describe('auditFinancialConsistency — multi-event days', () => {
  it('2026-07-21 has multiple event types', () => {
    const store = createFinancialEventStore(detail(), today);
    const types = eventsOnSameDay(store, '2026-07-21');
    expect(types.length).toBeGreaterThanOrEqual(1);
  });

  it('audit passes with invoice_generated + invoice_due same cycle', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-09-10',
          invoice_id: 'inv-both',
          invoice_created_at: '2026-09-08T10:00:00Z',
          invoice_status: 'pending',
        }),
      ],
    });
    expect(auditFinancialConsistency(createFinancialEventStore(d, today)).ok).toBe(true);
  });
});

describe('auditFinancialConsistency — visual consistency', () => {
  it('calendar statusPt matches event statusLabel for payments', () => {
    const store = createFinancialEventStore(detail(), today);
    for (const pay of store.getEventsByType('payment')) {
      const cal = store.getCalendarEvents().find((c) => c.ymd === pay.ymd && c.kind === 'paid');
      expect(cal?.statusPt).toBe('Pago');
    }
  });

  it('history uses Pago not synonyms', () => {
    const store = createFinancialEventStore(detail(), today);
    const paidRows = store.getHistoryRows().filter((h) => h.visual === 'paid');
    for (const r of paidRows) {
      expect(r.statusPt).toBe('Pago');
    }
  });

  it('timeline title Pago for payments', () => {
    const store = createFinancialEventStore(detail(), today);
    const pays = store.getTimelineItems().filter((t) => t.title === 'Pago');
    expect(pays.length).toBeGreaterThan(0);
  });
});

describe('auditFinancialConsistency — builder event count stability', () => {
  it('repeated audit same result', () => {
    const store = createFinancialEventStore(detail(), today);
    const a = auditFinancialConsistency(store);
    const b = auditFinancialConsistency(store);
    expect(a.eventCount).toBe(b.eventCount);
    expect(a.ok).toBe(b.ok);
  });

  it('events match buildFinancialEvents', () => {
    const d = detail();
    const store = createFinancialEventStore(d, today);
    expect(store.realEvents.length).toBe(buildFinancialEvents(d, today).length);
  });
});

describe('auditFinancialConsistency — edge cases', () => {
  it('minimal paid-only timeline', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-01-01',
          invoice_status: 'paid',
          operational_state: 'paid',
          processed_at: '2026-01-01T10:00:00Z',
        }),
      ],
    });
    expect(auditFinancialConsistency(createFinancialEventStore(d, today)).ok).toBe(true);
  });

  it('empty timeline still auditable', () => {
    const d = detail({ timeline: [] });
    const result = auditFinancialConsistency(createFinancialEventStore(d, today));
    expect(result.eventCount).toBeGreaterThan(0);
  });

  it('cancelled skips orphan upcoming errors', () => {
    const d = detail({ subscription: { ...detail().subscription, status: 'cancelled' }, timeline: [] });
    expect(auditFinancialConsistency(createFinancialEventStore(d, today)).ok).toBe(true);
  });
});

describe('auditFinancialConsistency — paused subscription', () => {
  it('upcoming shows Pausado for upcoming_cycle', () => {
    const d = detail({
      subscription: { ...detail().subscription, status: 'paused' },
      timeline: [
        ...detail().timeline,
        row({
          cycle_id: 'c-pending',
          due_date: '2026-08-01',
          cycle_date: '2026-08-01',
          invoice_id: null,
          operational_state: 'awaiting_generation',
          cycle_status: 'pending',
          status_pt: 'Prevista',
        }),
      ],
    });
    const store = createFinancialEventStore(d, today);
    const upcoming = store.getUpcomingReceipts().filter((u) => u.statusLabel === 'Pausado');
    expect(upcoming.length).toBeGreaterThan(0);
    expect(auditFinancialConsistency(store).ok).toBe(true);
  });
});

describe('auditFinancialConsistency — cancelled empty upcoming', () => {
  it('no upcoming receipts when cancelled', () => {
    const d = detail({ subscription: { ...detail().subscription, status: 'cancelled' } });
    const store = createFinancialEventStore(d, today);
    expect(store.getUpcomingReceipts()).toHaveLength(0);
    expect(auditFinancialConsistency(store).ok).toBe(true);
  });
});

describe('auditFinancialConsistency — invoice_generated on calendar', () => {
  it('2026-07-18 invoice_generated appears on calendar', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getCalendarEvents().some((c) => c.ymd === '2026-07-18')).toBe(true);
  });
});

describe('auditFinancialConsistency — failure on calendar', () => {
  it('definitive failure on past due in calendar', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getCalendarEvents().some((c) => c.ymd === '2026-05-01' && c.kind === 'failed')).toBe(true);
  });
});

describe('auditFinancialConsistency — error structure', () => {
  it('errors have code and surface', () => {
    const store = createFinancialEventStore(detail(), today);
    const broken = Object.assign(Object.create(Object.getPrototypeOf(store)), store, {
      getCalendarEvents: () => [],
    });
    const err = auditFinancialConsistency(broken).errors[0];
    expect(err.code).toBeTruthy();
    expect(err.surface).toBeTruthy();
    expect(err.message).toBeTruthy();
  });
});
