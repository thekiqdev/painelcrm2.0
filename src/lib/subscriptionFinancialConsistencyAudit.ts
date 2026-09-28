import type { FinancialEventStore } from './subscriptionFinancialEventStore';
import type { FinancialEventType } from './financialEventTypes';

export type ConsistencySurface =
  | 'calendar'
  | 'timeline'
  | 'history'
  | 'kpis'
  | 'insights'
  | 'upcoming';

export type ConsistencyError = {
  code: string;
  surface: ConsistencySurface;
  message: string;
  expected?: string;
  actual?: string;
};

export type ConsistencyAuditResult = {
  ok: boolean;
  errors: ConsistencyError[];
  eventCount: number;
  surfaces: Record<ConsistencySurface, number>;
};

function err(
  code: string,
  surface: ConsistencySurface,
  message: string,
  expected?: string,
  actual?: string
): ConsistencyError {
  return { code, surface, message, expected, actual };
}

export function auditFinancialConsistency(store: FinancialEventStore): ConsistencyAuditResult {
  const errors: ConsistencyError[] = [];
  const events = store.events;
  const payments = store.getEventsByType('payment');
  const calendar = store.getCalendarEvents();
  const history = store.getHistoryRows();
  const timeline = store.getTimelineItems();
  const upcoming = store.getUpcomingReceipts();
  const insights = store.getInsights();
  const kpis = store.getKpiCards();

  for (const pay of payments) {
    const onCalendar = calendar.some((c) => c.ymd === pay.ymd && c.kind === 'paid');
    if (!onCalendar) {
      errors.push(
        err(
          'PAYMENT_MISSING_CALENDAR',
          'calendar',
          `Pagamento ${pay.ymd} ausente no calendário`,
          pay.ymd,
          calendar.filter((c) => c.kind === 'paid').map((c) => c.ymd).join(',')
        )
      );
    }
    const inHistory = history.some(
      (h) => h.dueYmd === pay.dueYmd && h.statusPt === 'Pago'
    );
    if (!inHistory) {
      errors.push(
        err(
          'PAYMENT_MISSING_HISTORY',
          'history',
          `Pagamento ${pay.dueYmd} ausente no histórico`,
          pay.dueYmd
        )
      );
    }
    const inTimeline = timeline.some((t) => t.ymd === pay.ymd && t.title === 'Pago');
    if (!inTimeline) {
      errors.push(
        err('PAYMENT_MISSING_TIMELINE', 'timeline', `Pagamento ${pay.ymd} ausente na timeline`, pay.ymd)
      );
    }
  }

  for (const row of history) {
    if (!row.dueYmd) continue;
    const related = events.filter((e) => e.dueYmd === row.dueYmd || e.invoiceId === row.invoiceId);
    if (related.length === 0) {
      errors.push(
        err('HISTORY_ORPHAN', 'history', `Histórico sem evento: ${row.dueYmd}`, row.dueYmd)
      );
    }
    const cal = calendar.find((c) => c.ymd === row.dueYmd || c.invoiceId === row.invoiceId);
    if (!cal && row.statusPt !== 'Cancelado') {
      const anyOnDay = calendar.some((c) => c.ymd === row.dueYmd);
      if (!anyOnDay) {
        errors.push(
          err('HISTORY_MISSING_CALENDAR', 'calendar', `Histórico ${row.dueYmd} sem evento no calendário`, row.dueYmd)
        );
      }
    }
    if (row.amountCents != null) {
      const ev = related[0];
      if (ev?.amountCents != null && ev.amountCents !== row.amountCents) {
        errors.push(
          err(
            'AMOUNT_MISMATCH',
            'history',
            `Valor divergente em ${row.dueYmd}`,
            String(row.amountCents),
            String(ev.amountCents)
          )
        );
      }
    }
  }

  for (const u of upcoming) {
    const match = events.some((e) => e.ymd === u.ymd);
    if (!match) {
      errors.push(err('UPCOMING_ORPHAN', 'upcoming', `Próximo recebimento ${u.ymd} sem evento`, u.ymd));
    }
    const cal = calendar.some((c) => c.ymd === u.ymd);
    if (!cal) {
      errors.push(err('UPCOMING_MISSING_CALENDAR', 'calendar', `Próximo ${u.ymd} ausente no calendário`, u.ymd));
    }
  }

  const receivedKpi = kpis.find((k) => k.key === 'received');
  const paymentTotal = payments.reduce((s, e) => s + (e.amountCents ?? 0), 0);
  if (receivedKpi && paymentTotal > 0 && !receivedKpi.primary.includes(String(Math.round(paymentTotal / 100)))) {
    errors.push(
      err(
        'KPI_RECEIVED_MISMATCH',
        'kpis',
        'KPI Recebido não reflete soma de pagamentos',
        String(paymentTotal),
        receivedKpi.primary
      )
    );
  }

  if (insights.length === 0 && events.length > 0) {
    errors.push(err('INSIGHTS_EMPTY', 'insights', 'Insights vazios com eventos presentes'));
  }

  const calendarPaymentDays = new Set(calendar.filter((c) => c.kind === 'paid').map((c) => c.ymd));
  const paymentDays = new Set(payments.map((p) => p.ymd));
  for (const d of paymentDays) {
    if (!calendarPaymentDays.has(d)) {
      errors.push(err('CALENDAR_PAYMENT_DAY', 'calendar', `Dia de pagamento ${d} não no calendário`, d));
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    eventCount: events.length,
    surfaces: {
      calendar: calendar.length,
      timeline: timeline.length,
      history: history.length,
      kpis: kpis.length,
      insights: insights.length,
      upcoming: upcoming.length,
    },
  };
}

export function assertFinancialConsistency(store: FinancialEventStore): void {
  const result = auditFinancialConsistency(store);
  if (!result.ok) {
    const first = result.errors[0];
    throw new Error(`ConsistencyError: ${first.code} — ${first.message}`);
  }
}

export function paymentDatesInAllSurfaces(store: FinancialEventStore): string[] {
  return store.getEventsByType('payment').map((e) => e.ymd);
}

export function eventsOnSameDay(store: FinancialEventStore, ymd: string): FinancialEventType[] {
  return store.getEventsForDay(ymd).map((e) => e.type);
}
