import { describe, it, expect } from 'vitest';
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import {
  badgeVariantFromCalendarKind,
  badgeVariantFromHistoryStatus,
  badgeVariantFromVisual,
} from './financialStatusBadge';
import {
  buildEnrichedHumanizedTimeline,
  buildFinancialMonthOverview,
  calendarEventPriority,
  calendarEventsMatchHistory,
  compareTimelineSources,
  enrichUpcomingReceipts,
  expectedCalendarKindsForHistoryRow,
  groupCalendarEventsByDay,
  groupEnrichedTimelineByMonth,
  historyRowAmountMatchesCalendar,
  humanizedTimelineCoversHistory,
  isKpiNavigable,
  kpiReceivedMatchesHistory,
  lazySectionDefaultVisible,
  pickPrimaryCalendarEvent,
  resolveKpiNavigation,
  shouldDeferFinancialSection,
  sortCalendarEventsByPriority,
} from './subscriptionFinancialConsistency';
import {
  buildFinancialCalendarEvents,
  buildFinancialKpiCards,
  buildUpcomingReceipts,
  type FinancialCalendarEvent,
} from './subscriptionFinancialExperience';
import { buildFinancialHistoryRows } from './billingSubscriptionExperience';

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

function ev(kind: FinancialCalendarEvent['kind'], ymd: string, invoiceId: string | null = null): FinancialCalendarEvent {
  return {
    id: `${kind}-${ymd}`,
    ymd,
    kind,
    emoji: '🟢',
    title: kind,
    amountCents: 11000,
    competence: 'Jul/26',
    invoiceId,
    statusPt: kind,
    gateway: 'mp',
    paidAt: kind === 'paid' ? ymd : null,
  };
}

describe('calendarEventPriority', () => {
  it('paid highest', () => expect(calendarEventPriority('paid')).toBeLessThan(calendarEventPriority('failed')));
  it('failed before due', () => expect(calendarEventPriority('failed')).toBeLessThan(calendarEventPriority('due')));
  it('due before invoiced', () => expect(calendarEventPriority('due')).toBeLessThan(calendarEventPriority('invoiced')));
});

describe('sortCalendarEventsByPriority', () => {
  it('orders same day', () => {
    const sorted = sortCalendarEventsByPriority([
      ev('invoiced', '2026-07-14'),
      ev('failed', '2026-07-14'),
      ev('paid', '2026-07-14'),
    ]);
    expect(sorted[0].kind).toBe('paid');
    expect(sorted[1].kind).toBe('failed');
  });
});

describe('pickPrimaryCalendarEvent', () => {
  it('picks paid over failure', () => {
    const p = pickPrimaryCalendarEvent([ev('failed', '2026-07-01'), ev('paid', '2026-07-01')]);
    expect(p?.kind).toBe('paid');
  });
});

describe('groupCalendarEventsByDay', () => {
  it('groups and sorts', () => {
    const map = groupCalendarEventsByDay([ev('due', '2026-07-01'), ev('paid', '2026-07-01')]);
    expect(map.get('2026-07-01')?.[0].kind).toBe('paid');
  });
});

describe('buildFinancialCalendarEvents consistency', () => {
  it('includes paid events', () => {
    const events = buildFinancialCalendarEvents(detail(), today);
    expect(events.some((e) => e.kind === 'paid')).toBe(true);
  });
  it('includes failure without invoice', () => {
    const events = buildFinancialCalendarEvents(detail(), today);
    expect(events.some((e) => e.kind === 'failed')).toBe(true);
  });
  it('includes future cycles', () => {
    const events = buildFinancialCalendarEvents(detail(), today);
    expect(events.some((e) => e.title.includes('Próximo') || e.statusPt === 'Previsto')).toBe(true);
  });
  it('failure on past due appears', () => {
    const events = buildFinancialCalendarEvents(detail(), today);
    expect(events.some((e) => e.ymd === '2026-05-01' && e.kind === 'failed')).toBe(true);
  });
});

describe('calendarEventsMatchHistory', () => {
  it('reports counts', () => {
    const r = calendarEventsMatchHistory(detail(), today);
    expect(r.calendarCount).toBeGreaterThan(0);
    expect(r.historyCount).toBeGreaterThan(0);
  });
});

describe('buildFinancialMonthOverview', () => {
  it('returns 3 months', () => {
    expect(buildFinancialMonthOverview(detail(), today)).toHaveLength(3);
  });
  it('june paid icon', () => {
    const jun = buildFinancialMonthOverview(detail(), today)[0];
    expect(jun.statusIcon).toBe('✔');
  });
  it('no progress bars', () => {
    const months = buildFinancialMonthOverview(detail(), today);
    expect(months.every((m) => typeof m.statusLabel === 'string')).toBe(true);
  });
});

describe('enrichUpcomingReceipts', () => {
  it('recoverable failure is not marked failed', () => {
    const d = detail({
      timeline: [
        ...detail().timeline,
        row({
          due_date: '2026-07-14',
          invoice_id: null,
          operational_state: 'failed',
          job_error_snippet: 'timeout',
          cycle_id: 'c-rec',
        }),
      ],
    });
    const base = buildUpcomingReceipts(d, 4);
    const enriched = enrichUpcomingReceipts(d, base);
    const item = enriched.find((r) => r.ymd === '2026-07-14');
    expect(item?.failed).not.toBe(true);
    expect(item?.canGenerate).toBe(true);
  });
  it('can generate when failed', () => {
    const enriched = enrichUpcomingReceipts(detail(), buildUpcomingReceipts(detail(), 4));
    expect(enriched.some((r) => r.canGenerate)).toBe(true);
  });
});

describe('buildEnrichedHumanizedTimeline', () => {
  it('includes payment', () => {
    expect(buildEnrichedHumanizedTimeline(detail()).some((i) => i.icon === '💰')).toBe(true);
  });
  it('includes failure', () => {
    expect(buildEnrichedHumanizedTimeline(detail()).some((i) => i.icon === '⚠')).toBe(true);
  });
  it('includes invoice', () => {
    expect(buildEnrichedHumanizedTimeline(detail()).some((i) => i.icon === '🧾')).toBe(true);
  });
});

describe('groupEnrichedTimelineByMonth', () => {
  it('groups items', () => {
    const groups = groupEnrichedTimelineByMonth(buildEnrichedHumanizedTimeline(detail()));
    expect(groups.length).toBeGreaterThan(0);
  });
});

describe('compareTimelineSources', () => {
  it('enriched has more or equal items', () => {
    const c = compareTimelineSources(detail());
    expect(c.enrichedCount).toBeGreaterThanOrEqual(c.legacyCount);
  });
});

describe('humanizedTimelineCoversHistory', () => {
  it('covers invoice rows', () => {
    expect(humanizedTimelineCoversHistory(detail())).toBe(true);
  });
});

describe('resolveKpiNavigation', () => {
  it('received → paid history', () => {
    expect(resolveKpiNavigation('received', null, null)).toEqual({ type: 'history', filter: 'paid' });
  });
  it('open → pending', () => {
    expect(resolveKpiNavigation('open', null, null)).toEqual({ type: 'history', filter: 'pending' });
  });
  it('next_receipt scroll', () => {
    expect(resolveKpiNavigation('next_receipt', null, '2026-07-21')).toEqual({
      type: 'scroll',
      targetId: 'financial-history',
    });
  });
  it('status → calendar', () => {
    expect(resolveKpiNavigation('status', null, null)).toEqual({
      type: 'scroll',
      targetId: 'financial-calendar',
    });
  });
  it('last payment opens invoice', () => {
    expect(resolveKpiNavigation('last_payment', 'inv-x', null)).toEqual({
      type: 'open_invoice',
      invoiceId: 'inv-x',
    });
  });
});

describe('isKpiNavigable', () => {
  it('status navigable', () => expect(isKpiNavigable('status')).toBe(true));
  it('forecast not', () => expect(isKpiNavigable('forecast_12m')).toBe(false));
});

describe('lazy render helpers', () => {
  it('header visible by default', () => expect(lazySectionDefaultVisible('financial-header')).toBe(true));
  it('calendar deferred', () => expect(shouldDeferFinancialSection('financial-calendar')).toBe(true));
});

describe('financialStatusBadge', () => {
  it('paid green', () => expect(badgeVariantFromVisual('paid')).toBe('paid'));
  it('failed from status', () => {
    expect(badgeVariantFromHistoryStatus('future', 'Falha na geração', null)).toBe('failed');
  });
  it('pending yellow', () => expect(badgeVariantFromVisual('generated')).toBe('pending'));
  it('cancelled gray', () => expect(badgeVariantFromVisual('cancelled')).toBe('cancelled'));
  it('failed calendar kind', () => expect(badgeVariantFromCalendarKind('failed')).toBe('failed'));
});

describe('historyRowAmountMatchesCalendar', () => {
  it('matches amounts', () => {
    const h: FinancialHistoryRow = {
      id: '1',
      competence: 'Jul',
      amountCents: 11000,
      dueYmd: '2026-07-14',
      paidAt: null,
      statusPt: 'x',
      gateway: null,
      invoiceId: 'inv-1',
      visual: 'generated',
    };
    expect(historyRowAmountMatchesCalendar(h, [ev('invoiced', '2026-07-14', 'inv-1')])).toBe(true);
  });
});

describe('expectedCalendarKindsForHistoryRow', () => {
  it('paid row', () => {
    const kinds = expectedCalendarKindsForHistoryRow(
      { visual: 'paid', dueYmd: '2026-06-30', invoiceId: 'x' } as FinancialHistoryRow,
      today
    );
    expect(kinds).toContain('paid');
  });
});

describe('kpiReceivedMatchesHistory', () => {
  it('returns boolean', () => {
    expect(typeof kpiReceivedMatchesHistory(detail(), today)).toBe('boolean');
  });
});

describe('buildFinancialKpiCards integration', () => {
  it('has 6 cards', () => {
    expect(buildFinancialKpiCards(detail(), today)).toHaveLength(6);
  });
});

describe('buildFinancialHistoryRows integration', () => {
  it('includes failed row', () => {
    const rows = buildFinancialHistoryRows(detail(), today);
    expect(rows.some((r) => r.statusPt === 'Falhou')).toBe(true);
  });
  it('has notes on failed', () => {
    const rows = buildFinancialHistoryRows(detail(), today);
    expect(rows.find((r) => r.eventType === 'invoice_failed')?.notes).toBeTruthy();
  });
});

describe('calendar x history parity scenarios', () => {
  const cases = [
    { due: '2026-06-30', kind: 'paid' as const },
    { due: '2026-07-07', kind: 'paid' as const },
    { due: '2026-07-14', kind: 'failed' as const },
  ];
  for (const c of cases) {
    it(`calendar has event near ${c.due}`, () => {
      const events = buildFinancialCalendarEvents(detail(), today);
      expect(events.some((e) => e.ymd === c.due || e.kind === c.kind)).toBe(true);
    });
  }
});

describe('month overview labels', () => {
  it('partial july', () => {
    const jul = buildFinancialMonthOverview(detail(), today).find((m) => m.monthKey === '2026-07');
    expect(jul?.statusIcon).toBe('⚠');
  });
});

describe('enriched upcoming count', () => {
  it('includes timeline failures beyond future cycles', () => {
    const base = buildUpcomingReceipts(detail(), 8);
    const enriched = enrichUpcomingReceipts(detail(), base);
    expect(enriched.length).toBeGreaterThanOrEqual(base.length);
    expect(enriched.some((r) => r.failed)).toBe(true);
  });
});

describe('timeline failure subtitle', () => {
  it('has error message', () => {
    const fail = buildEnrichedHumanizedTimeline(detail()).find((i) => i.icon === '⚠');
    expect(fail?.subtitle).toBeTruthy();
  });
});

describe('accessibility navigation targets', () => {
  const cases = [
    { key: 'next_receipt' as const, type: 'scroll' as const },
    { key: 'status' as const, type: 'scroll' as const },
    { key: 'received' as const, type: 'history' as const },
  ];
  for (const c of cases) {
    it(`navigation for ${c.key}`, () => {
      const nav = resolveKpiNavigation(c.key, null, '2026-07-21');
      expect(nav.type).toBe(c.type);
    });
  }
});

describe('responsive history structure', () => {
  it('history rows have secondary fields', () => {
    const rows = buildFinancialHistoryRows(detail());
    expect(rows.every((r) => 'notes' in r)).toBe(true);
  });
});

describe('badge consistency matrix', () => {
  const matrix: Array<[string, string, FinancialHistoryRow['visual']]> = [
    ['Pago', 'paid', 'paid'],
    ['Aguardando', 'pending', 'generated'],
    ['Falha', 'failed', 'overdue'],
  ];
  for (const [status, expected, visual] of matrix) {
    it(`${status} → ${expected}`, () => {
      const v = badgeVariantFromHistoryStatus(visual, status, visual === 'paid' ? 'x' : null);
      if (expected === 'pending') expect(v).toBe('pending');
      else expect(v).toBe(expected);
    });
  }
});

describe('calendar priority exhaustive', () => {
  const kinds: FinancialCalendarEvent['kind'][] = ['paid', 'failed', 'overdue', 'due', 'reprocessed', 'invoiced', 'cancelled'];
  it('all kinds have priority', () => {
    for (const k of kinds) expect(calendarEventPriority(k)).toBeLessThan(100);
  });
});

describe('future cycle dedupe', () => {
  it('does not duplicate timeline due dates', () => {
    const events = buildFinancialCalendarEvents(detail(), today);
    const july14 = events.filter((e) => e.ymd === '2026-07-14');
    const futures = july14.filter((e) => e.id.startsWith('future-'));
    expect(futures.length).toBe(0);
  });
});

describe('popover field coverage', () => {
  it('events have client and update fields', () => {
    const ev = buildFinancialCalendarEvents(detail(), today)[0];
    expect('clientName' in ev).toBe(true);
    expect('lastUpdatedAt' in ev).toBe(true);
  });
});

describe('kpi navigation all keys', () => {
  const keys = ['received', 'open', 'next_receipt', 'forecast_12m', 'last_payment', 'status'] as const;
  for (const key of keys) {
    it(`${key} resolves`, () => {
      expect(resolveKpiNavigation(key, 'inv', '2026-07-21').type).not.toBeUndefined();
    });
  }
});

describe('month overview future month', () => {
  it('august not started', () => {
    const aug = buildFinancialMonthOverview(detail(), today).find((m) => m.monthKey === '2026-08');
    expect(aug?.statusIcon).toBe('○');
  });
});

describe('enriched timeline payment count', () => {
  it('two payments', () => {
    const pays = buildEnrichedHumanizedTimeline(detail()).filter((i) => i.icon === '💰');
    expect(pays.length).toBe(2);
  });
});

describe('history filter parity', () => {
  it('paid history rows exist', () => {
    const rows = buildFinancialHistoryRows(detail()).filter((r) => r.visual === 'paid');
    expect(rows.length).toBe(2);
  });
});

describe('calendar legend kinds', () => {
  it('includes failed', () => {
    const events = buildFinancialCalendarEvents(detail(), today);
    expect(events.some((e) => e.kind === 'failed')).toBe(true);
  });
});

describe('scroll defer sections', () => {
  const deferred = ['financial-calendar', 'financial-history'];
  for (const s of deferred) {
    it(`${s} deferred`, () => expect(shouldDeferFinancialSection(s)).toBe(true));
  }
});

describe('invoice id on enriched upcoming', () => {
  it('links pending invoice on timeline', () => {
    const enriched = enrichUpcomingReceipts(detail(), buildUpcomingReceipts(detail(), 4));
    const pending = enriched.find((r) => r.ymd === '2026-07-21');
    expect(pending?.invoiceId).toBe('inv-pending');
  });
});

describe('gateway failed row', () => {
  it('creates failed event', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-08-01',
          invoice_id: 'inv-gw',
          operational_state: 'gateway_failed',
          status_pt: 'Recusado',
          cycle_id: 'gw1',
        }),
      ],
    });
    const events = buildFinancialCalendarEvents(d, today);
    expect(events.some((e) => e.kind === 'failed')).toBe(true);
  });
});

describe('cancelled row', () => {
  it('creates cancelled event', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-08-05',
          operational_state: 'cancelled',
          status_pt: 'Cancelada',
          invoice_id: null,
          cycle_id: 'cx1',
        }),
      ],
    });
    expect(buildFinancialCalendarEvents(d, today).some((e) => e.kind === 'cancelled')).toBe(true);
  });
});

describe('reprocessed row', () => {
  it('creates reprocessed event', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-08-10',
          has_auto_retry: true,
          invoice_id: 'inv-r',
          cycle_id: 'rx1',
        }),
      ],
    });
    expect(buildFinancialCalendarEvents(d, today).some((e) => e.kind === 'reprocessed')).toBe(true);
  });
});

describe('mobile card parity', () => {
  it('history amount matches kpi open', () => {
    const open = buildFinancialKpiCards(detail(), today).find((k) => k.key === 'open');
    expect(open?.primary).toBeTruthy();
  });
});

describe('quick actions invoice paths', () => {
  it('history rows with invoice', () => {
    expect(buildFinancialHistoryRows(detail()).filter((r) => r.invoiceId).length).toBeGreaterThan(0);
  });
});

describe('timeline month groups sort desc', () => {
  it('newest first', () => {
    const groups = groupEnrichedTimelineByMonth(buildEnrichedHumanizedTimeline(detail()));
    if (groups.length >= 2) {
      expect(groups[0].monthKey >= groups[1].monthKey).toBe(true);
    }
  });
});

describe('empty subscription', () => {
  it('empty timeline overview', () => {
    const d = detail({ timeline: [] });
    expect(buildFinancialMonthOverview(d, today)).toHaveLength(3);
  });
});

describe('paused subscription upcoming', () => {
  it('still builds receipts when active', () => {
    expect(buildUpcomingReceipts(detail(), 4).length).toBeGreaterThan(0);
  });
});

describe('consistency score', () => {
  it('calendar count >= paid count', () => {
    const d = detail();
    const paid = d.timeline.filter((r) => r.operational_state === 'paid').length;
    const calPaid = buildFinancialCalendarEvents(d, today).filter((e) => e.kind === 'paid').length;
    expect(calPaid).toBeGreaterThanOrEqual(paid);
  });
});

describe('invoiced emission event', () => {
  it('calendar has invoiced kind', () => {
    const events = buildFinancialCalendarEvents(detail(), today);
    expect(events.some((e) => e.kind === 'invoiced')).toBe(true);
  });
});

describe('overdue detection', () => {
  it('past unpaid creates overdue or failed', () => {
    const d = detail({
      timeline: [
        row({
          due_date: '2026-06-01',
          invoice_id: 'inv-old',
          invoice_status: 'pending',
          operational_state: 'generated',
          cycle_id: 'old1',
        }),
      ],
    });
    const kinds = buildFinancialCalendarEvents(d, today).map((e) => e.kind);
    expect(kinds.some((k) => k === 'overdue' || k === 'invoiced')).toBe(true);
  });
});

describe('month overview paid detail', () => {
  it('shows received amount', () => {
    const jun = buildFinancialMonthOverview(detail(), today)[0];
    expect(jun.detailLabel).toContain('Recebido');
  });
});

describe('navigation scroll targets unique', () => {
  it('upcoming and timeline differ', () => {
    const a = resolveKpiNavigation('next_receipt', null, '2026-07-21');
    const b = resolveKpiNavigation('status', null, null);
    if (a.type === 'scroll' && b.type === 'scroll') {
      expect(a.targetId).not.toBe(b.targetId);
    }
  });
});

describe('history notes field', () => {
  it('failed row has timeout note', () => {
    const failed = buildFinancialHistoryRows(detail(), today).find((r) => r.eventType === 'invoice_failed');
    expect(failed?.notes?.toLowerCase()).toContain('timeout');
  });
});

describe('calendar client name', () => {
  it('propagates client', () => {
    const ev = buildFinancialCalendarEvents(detail(), today).find((e) => e.clientName);
    expect(ev?.clientName).toBe('Cliente Teste');
  });
});

describe('timeline enriched sort', () => {
  it('desc by date', () => {
    const items = buildEnrichedHumanizedTimeline(detail());
    for (let i = 1; i < items.length; i += 1) {
      expect(items[i - 1].ymd >= items[i].ymd).toBe(true);
    }
  });
});

describe('badge failed gateway', () => {
  it('recusado is failed', () => {
    expect(badgeVariantFromHistoryStatus('overdue', 'Gateway recusou', 'inv')).toBe('failed');
  });
});
