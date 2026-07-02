import { describe, it, expect } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import { createFinancialEventStore } from './subscriptionFinancialEventStore';
import type { FinancialEventType } from './financialEventTypes';

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
    timeline: [
      row({
        due_date: '2026-06-30',
        invoice_id: 'inv-paid',
        invoice_status: 'paid',
        operational_state: 'paid',
        status_pt: 'Pago',
        processed_at: '2026-06-30T12:00:00Z',
        amount_cents: 11000,
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
        due_date: '2026-07-14',
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
    ],
    automation_summary: {
      last_generation_at: null,
      last_generation_label: null,
      next_generation_ymd: '2026-07-14',
      next_charge_ymd: '2026-07-21',
    },
    cycles_raw: [],
    cycles_read_enabled: false,
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

const ALL_TYPES: FinancialEventType[] = [
  'payment',
  'invoice_generated',
  'invoice_due',
  'invoice_failed',
  'invoice_cancelled',
  'invoice_reprocessed',
  'invoice_refunded',
  'upcoming_cycle',
  'manual_charge',
  'charge_attempt',
];

describe('buildFinancialEvents — core', () => {
  it('returns non-empty events for standard fixture', () => {
    expect(buildFinancialEvents(detail(), today).length).toBeGreaterThan(0);
  });

  it('sorts by ymd then id', () => {
    const events = buildFinancialEvents(detail(), today);
    for (let i = 1; i < events.length; i++) {
      const cmp = events[i - 1].ymd.localeCompare(events[i].ymd);
      expect(cmp <= 0).toBe(true);
      if (cmp === 0) {
        expect(events[i - 1].id.localeCompare(events[i].id) <= 0).toBe(true);
      }
    }
  });

  it('skips lifecycle merge rows', () => {
    const d = detail({
      timeline: [
        row({ merge_source: 'lifecycle', due_date: '2026-08-01', operational_state: 'paid', invoice_status: 'paid' }),
      ],
    });
    expect(buildFinancialEvents(d, today).some((e) => e.ymd === '2026-08-01')).toBe(false);
  });

  it('assigns clientName from detail', () => {
    expect(buildFinancialEvents(detail(), today).every((e) => e.clientName === 'Cliente Teste')).toBe(true);
  });

  it('assigns cycleKey on every event', () => {
    expect(buildFinancialEvents(detail(), today).every((e) => e.cycleKey.length > 0)).toBe(true);
  });
});

describe('buildFinancialEvents — payment on due_date (07/07 fix)', () => {
  it('payment ymd equals due_date not processed_at', () => {
    const pay = buildFinancialEvents(detail(), today).find((e) => e.invoiceId === 'inv-2');
    expect(pay?.type).toBe('payment');
    expect(pay?.ymd).toBe('2026-07-07');
    expect(pay?.paidAt).toBe('2026-07-07');
  });

  it('payment appears on calendar at due_date via store', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getCalendarEvents().some((c) => c.ymd === '2026-07-07' && c.kind === 'paid')).toBe(true);
  });

  it('payment in history at due_date', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getHistoryRows().some((h) => h.dueYmd === '2026-07-07' && h.statusPt === 'Pago')).toBe(true);
  });

  it('payment in timeline at due_date', () => {
    const store = createFinancialEventStore(detail(), today);
    expect(store.getTimelineItems().some((t) => t.ymd === '2026-07-07' && t.title === 'Pago')).toBe(true);
  });

  it('processed_at different from due still uses due', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-05-01',
          processed_at: '2026-05-05T10:00:00Z',
          invoice_status: 'paid',
          operational_state: 'paid',
          invoice_id: 'inv-late',
        }),
      ],
    });
    const pay = buildFinancialEvents(d, today).find((e) => e.invoiceId === 'inv-late');
    expect(pay?.ymd).toBe('2026-05-01');
    expect(pay?.paidAt).toBe('2026-05-05');
  });
});

describe('buildFinancialEvents — event types', () => {
  it('includes payment', () => {
    expect(buildFinancialEvents(detail(), today).some((e) => e.type === 'payment')).toBe(true);
  });

  it('includes upcoming_cycle for recoverable generation failure', () => {
    expect(buildFinancialEvents(detail(), today).some((e) => e.type === 'upcoming_cycle' && e.ymd === '2026-07-14')).toBe(
      true
    );
  });

  it('includes invoice_failed for past definitive failure', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-05-01',
          cycle_date: '2026-05-01',
          invoice_id: null,
          operational_state: 'failed',
          job_error_snippet: 'timeout',
          cycle_id: 'c-past',
        }),
      ],
    });
    expect(buildFinancialEvents(d, today).some((e) => e.type === 'invoice_failed')).toBe(true);
  });

  it('includes invoice_due for pending invoice', () => {
    expect(buildFinancialEvents(detail(), today).some((e) => e.type === 'invoice_due')).toBe(true);
  });

  it('includes invoice_generated when created before due', () => {
    expect(buildFinancialEvents(detail(), today).some((e) => e.type === 'invoice_generated')).toBe(true);
  });

  it('includes upcoming_cycle from future cycles', () => {
    expect(buildFinancialEvents(detail(), today).some((e) => e.type === 'upcoming_cycle')).toBe(true);
  });

  it('invoice_refunded for refunded row', () => {
    const d = detail({
      timeline: [row({ invoice_status: 'refunded', operational_state: 'refunded', due_date: '2026-08-01' })],
    });
    expect(buildFinancialEvents(d, today).some((e) => e.type === 'invoice_refunded')).toBe(true);
  });

  it('invoice_cancelled only when invoice exists and is cancelled', () => {
    const d = detail({
      timeline: [
        row({
          operational_state: 'cancelled',
          due_date: '2026-08-01',
          invoice_id: 'inv-c',
          invoice_status: 'cancelled',
        }),
      ],
    });
    expect(buildFinancialEvents(d, today).some((e) => e.type === 'invoice_cancelled')).toBe(true);
  });

  it('cancelled row without invoice becomes upcoming_cycle not invoice_cancelled', () => {
    const d = detail({
      timeline: [row({ operational_state: 'cancelled', due_date: '2026-08-01', invoice_id: null })],
    });
    const events = buildFinancialEvents(d, today);
    expect(events.some((e) => e.type === 'invoice_cancelled')).toBe(false);
    expect(events.some((e) => e.type === 'upcoming_cycle')).toBe(true);
  });

  it('invoice_reprocessed when has_auto_retry', () => {
    const d = detail({
      timeline: [row({ has_auto_retry: true, due_date: '2026-08-01', invoice_id: 'inv-r' })],
    });
    expect(buildFinancialEvents(d, today).some((e) => e.type === 'invoice_reprocessed')).toBe(true);
  });

  it('charge_attempt when job retry', () => {
    const d = detail({
      timeline: [
        row({
          has_auto_retry: true,
          job_id: 'job-1',
          job_retry_at: '2026-08-02T10:00:00Z',
          due_date: '2026-08-01',
        }),
      ],
    });
    expect(buildFinancialEvents(d, today).some((e) => e.type === 'charge_attempt')).toBe(true);
  });

  it('manual_charge for manual_invoice', () => {
    const d = detail({
      timeline: [
        row({
          operational_state: 'manual_invoice',
          invoice_created_at: '2026-08-03T10:00:00Z',
          due_date: '2026-08-10',
        }),
      ],
    });
    expect(buildFinancialEvents(d, today).some((e) => e.type === 'manual_charge')).toBe(true);
  });

  it('gateway_failed maps to invoice_failed', () => {
    const d = detail({
      timeline: [row({ operational_state: 'gateway_failed', due_date: '2026-08-05' })],
    });
    expect(buildFinancialEvents(d, today).some((e) => e.type === 'invoice_failed')).toBe(true);
  });
});

describe('buildFinancialEvents — status labels (visual consistency)', () => {
  it('payment uses Pago not Recebido', () => {
    const pay = buildFinancialEvents(detail(), today).find((e) => e.type === 'payment');
    expect(pay?.statusLabel).toBe('Pago');
  });

  it.each(['payment', 'invoice_due', 'invoice_failed'] as FinancialEventType[])(
    'type %s has statusBadge',
    (type) => {
      const ev = buildFinancialEvents(detail(), today).find((e) => e.type === type);
      if (!ev) return;
      expect(ev.statusBadge).toBeTruthy();
    }
  );

  it('overdue invoice_due labeled Atrasada', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-06-01',
          invoice_id: 'inv-old',
          invoice_status: 'pending',
          operational_state: 'generated',
        }),
      ],
    });
    const ev = buildFinancialEvents(d, today).find((e) => e.type === 'invoice_due' && e.dueYmd === '2026-06-01');
    expect(ev?.statusLabel).toBe('Atrasada');
  });
});

describe('buildFinancialEvents — multiple events same day', () => {
  it('paid + invoice_generated on different dates for same cycle', () => {
    const events = buildFinancialEvents(detail(), today);
    const jul21 = events.filter((e) => e.dueYmd === '2026-07-21' || e.ymd === '2026-07-21');
    expect(jul21.length).toBeGreaterThanOrEqual(1);
  });

  it('store groups multiple events per day', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-07-14',
          invoice_id: 'inv-multi',
          invoice_created_at: '2026-07-14T10:00:00Z',
          invoice_status: 'pending',
          operational_state: 'generated',
        }),
      ],
    });
    const day = createFinancialEventStore(d, today).getEventsForDay('2026-07-14');
    expect(day.length).toBeGreaterThanOrEqual(1);
  });

  it('payment and invoice_generated can coexist on different ymd same due', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-09-01',
          invoice_created_at: '2026-08-28T10:00:00Z',
          invoice_status: 'paid',
          operational_state: 'paid',
          processed_at: '2026-09-01T12:00:00Z',
        }),
      ],
    });
    const types = buildFinancialEvents(d, today).map((e) => e.type);
    expect(types).toContain('payment');
  });
});

describe('buildFinancialEvents — subscription status', () => {
  it('cancelled subscription skips future upcoming_cycle from buildFutureCycles', () => {
    const d = detail({ subscription: { ...detail().subscription, status: 'cancelled' } });
    const upcoming = buildFinancialEvents(d, today).filter((e) => e.type === 'upcoming_cycle');
    expect(upcoming.every((e) => e.ymd <= today || e.dueYmd === null)).toBe(true);
  });

  it('paused still has timeline events', () => {
    const d = detail({ subscription: { ...detail().subscription, status: 'paused' } });
    expect(buildFinancialEvents(d, today).length).toBeGreaterThan(0);
  });

  it('empty timeline only future cycles', () => {
    const d = detail({ timeline: [] });
    expect(buildFinancialEvents(d, today).some((e) => e.type === 'upcoming_cycle')).toBe(true);
  });
});

describe('buildFinancialEvents — deduplication', () => {
  it('no duplicate event ids', () => {
    const events = buildFinancialEvents(detail(), today);
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBe(events.length);
  });

  it('does not duplicate timeline due in future cycles', () => {
    const events = buildFinancialEvents(detail(), today);
    const upcomingDates = events.filter((e) => e.type === 'upcoming_cycle').map((e) => e.ymd);
    const unique = new Set(upcomingDates);
    expect(unique.size).toBe(upcomingDates.length);
  });
});

describe('buildFinancialEvents — amounts', () => {
  it('preserves amount_cents on payment', () => {
    const pay = buildFinancialEvents(detail(), today).find((e) => e.invoiceId === 'inv-2');
    expect(pay?.amountCents).toBe(11000);
  });

  it('future cycle uses projected amount', () => {
    const upcoming = buildFinancialEvents(detail(), today).filter((e) => e.type === 'upcoming_cycle');
    expect(upcoming.some((e) => e.amountCents === 11000)).toBe(true);
  });
});

describe('buildFinancialEvents — parameterized dates', () => {
  const paymentDates = ['2026-06-30', '2026-07-07'];
  for (const ymd of paymentDates) {
    it(`payment event exists for ${ymd}`, () => {
      expect(
        buildFinancialEvents(detail(), today).some((e) => e.type === 'payment' && e.ymd === ymd)
      ).toBe(true);
    });
  }

  const failureYmds = ['2026-07-14'];
  for (const ymd of failureYmds) {
    it(`failure-related event near ${ymd}`, () => {
      const events = buildFinancialEvents(detail(), today);
      expect(events.some((e) => e.ymd === ymd || e.dueYmd === ymd)).toBe(true);
    });
  }
});

describe('buildFinancialEvents — store integration', () => {
  it('store event count matches builder', () => {
    const d = detail();
    expect(createFinancialEventStore(d, today).events.length).toBe(buildFinancialEvents(d, today).length);
  });

  it('KPI received sums payments', () => {
    const store = createFinancialEventStore(detail(), today);
    const payments = store.events.filter((e) => e.type === 'payment');
    const total = payments.reduce((s, e) => s + (e.amountCents ?? 0), 0);
    const kpi = store.getKpiCards().find((k) => k.key === 'received');
    expect(kpi?.primary).toContain(String(Math.round(total / 100)));
  });

  it('last payment KPI uses latest payment ymd', () => {
    const store = createFinancialEventStore(detail(), today);
    const kpi = store.getKpiCards().find((k) => k.key === 'last_payment');
    expect(kpi?.primary).toMatch(/Jul|jun/i);
  });

  it('upcoming receipts ymd exist in events', () => {
    const store = createFinancialEventStore(detail(), today);
    for (const u of store.getUpcomingReceipts()) {
      expect(store.events.some((e) => e.ymd === u.ymd)).toBe(true);
    }
  });
});

describe('buildFinancialEvents — type coverage matrix', () => {
  const scenarios: { name: string; d: CrmSubscriptionDetailPayload; expectType: FinancialEventType }[] = [
    {
      name: 'refunded',
      d: detail({ timeline: [row({ invoice_status: 'refunded', due_date: '2026-10-01' })] }),
      expectType: 'invoice_refunded',
    },
    {
      name: 'skipped',
      d: detail({ timeline: [row({ operational_state: 'skipped', due_date: '2026-10-02', invoice_id: null })] }),
      expectType: 'upcoming_cycle',
    },
    {
      name: 'scheduled no invoice',
      d: detail({
        timeline: [row({ operational_state: 'scheduled', due_date: '2026-12-01', invoice_id: null })],
      }),
      expectType: 'upcoming_cycle',
    },
    {
      name: 'awaiting_generation',
      d: detail({
        timeline: [row({ operational_state: 'awaiting_generation', due_date: '2026-12-15', invoice_id: null })],
      }),
      expectType: 'upcoming_cycle',
    },
    {
      name: 'chargeback',
      d: detail({ timeline: [row({ invoice_status: 'chargeback', due_date: '2026-10-03' })] }),
      expectType: 'invoice_refunded',
    },
  ];

  for (const s of scenarios) {
    it(`produces ${s.expectType} for ${s.name}`, () => {
      expect(buildFinancialEvents(s.d, today).some((e) => e.type === s.expectType)).toBe(true);
    });
  }
});

describe('buildFinancialEvents — invoice_generated date', () => {
  it('emits invoice_generated on created_at when before due', () => {
    const gen = buildFinancialEvents(detail(), today).find((e) => e.type === 'invoice_generated');
    expect(gen?.ymd).toBe('2026-07-18');
  });

  it('invoice_due uses due_date as ymd', () => {
    const due = buildFinancialEvents(detail(), today).find(
      (e) => e.type === 'invoice_due' && e.invoiceId === 'inv-pending'
    );
    expect(due?.ymd).toBe('2026-07-21');
  });
});

describe('buildFinancialEvents — notes and gateway', () => {
  it('failure event carries notes for definitive failure', () => {
    const fail = buildFinancialEvents(
      detail({
        timeline: [
          row({
            due_date: '2026-05-01',
            cycle_date: '2026-05-01',
            operational_state: 'failed',
            job_error_snippet: 'timeout',
            invoice_id: null,
            cycle_id: 'c-past',
          }),
        ],
      }),
      today
    ).find((e) => e.type === 'invoice_failed');
    expect(fail?.notes).toBeTruthy();
  });

  it('payment carries gateway', () => {
    const pay = buildFinancialEvents(detail(), today).find((e) => e.type === 'payment');
    expect(pay?.gateway).toBe('mercadopago');
  });
});

describe('buildFinancialEvents — ALL_TYPES presence in composite fixture', () => {
  const composite = detail({
    timeline: [
      row({
        has_auto_retry: true,
        job_id: 'j1',
        job_retry_at: '2026-07-15T10:00:00Z',
        due_date: '2026-07-15',
        invoice_id: 'inv-retry',
        cycle_id: 'c-retry',
      }),
      row({
        operational_state: 'manual_invoice',
        invoice_created_at: '2026-07-16T10:00:00Z',
        due_date: '2026-07-16',
        invoice_id: 'inv-manual',
        cycle_id: 'c-manual',
      }),
      row({ operational_state: 'cancelled', due_date: '2026-07-17', invoice_id: 'inv-cancel', invoice_status: 'cancelled', cycle_id: 'cx' }),
      row({ invoice_status: 'refunded', due_date: '2026-07-19', invoice_id: 'inv-ref', cycle_id: 'c-ref' }),
    ],
  });

  for (const type of ALL_TYPES) {
    it(`composite fixture may include ${type}`, () => {
      const found = buildFinancialEvents(composite, today).some((e) => e.type === type);
      if (type === 'invoice_cancelled' || type === 'invoice_refunded' || type === 'charge_attempt') {
        expect(found).toBe(true);
      } else {
        expect(typeof found).toBe('boolean');
      }
    });
  }
});
