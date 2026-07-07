/**
 * Fonte única de eventos financeiros da assinatura (Sprint 4.1L).
 * Calendário, Histórico, Sidebar, Card e Insights consomem exclusivamente esta coleção.
 */
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import type { FinancialEvent, FinancialEventType } from './financialEventTypes';
import type { CalendarVisualKind } from './billingSubscriptionExperience';
import { formatEventAmount, formatEventDateShort, eventTypePriority } from './financialEventHelpers';
import { formatYmdBrSafe } from './billingSafeDate';
import { normalizeYmdInput, advanceBillingDueYmd } from './billingSubscriptionExperience';
import type { NextInvoiceExperience } from './subscriptionNextInvoice';
import type { FinancialEventStore } from './subscriptionFinancialEventStore';
import { resolveOperationalCompetency } from './operationalCompetencyResolver';
import {
  isProjectedFinancialEvent,
  projectedPeriodEnd,
  resolveFirstProjectedEvent,
} from './subscriptionFinancialProjection';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatNextInvoiceDateLong(ymd: string): string {
  const day = Number(ymd.slice(8, 10));
  const mi = Number(ymd.slice(5, 7)) - 1;
  const year = ymd.slice(0, 4);
  if (mi < 0 || mi >= 12) return ymd;
  return `${day} ${MONTH_SHORT[mi]} ${year}`;
}

function formatCompetenceRange(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  dueYmd: string | null
): string {
  const ps = normalizeYmdInput(periodStart) ?? dueYmd;
  const pe = normalizeYmdInput(periodEnd);
  if (ps && pe) return `${formatYmdBrSafe(ps).slice(0, 5)} → ${formatYmdBrSafe(pe).slice(0, 5)}`;
  if (ps) return formatYmdBrSafe(ps);
  return '—';
}

export type NextChargePresentation = NextInvoiceExperience & {
  eventId: string | null;
  eventType: FinancialEventType | null;
  cycleId: string | null;
  /** Sprint 4.2H — previsão UX sem ciclo oficial. */
  isProjected?: boolean;
};

/** Constrói a coleção canônica de eventos financeiros. */
export function buildSubscriptionFinancialEvents(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialEvent[] {
  return buildFinancialEvents(detail, todayYmd);
}

function visualFromEventType(ev: FinancialEvent, today: string): CalendarVisualKind {
  if (ev.type === 'payment') return 'paid';
  if (ev.type === 'invoice_failed' || ev.type === 'charge_attempt') return 'overdue';
  if (ev.type === 'invoice_cancelled' || ev.type === 'invoice_refunded') return 'cancelled';
  if (ev.type === 'invoice_reprocessed') return 'reprocessed';
  if (ev.dueYmd && ev.dueYmd < today && ev.type === 'invoice_due') return 'overdue';
  if (ev.type === 'invoice_generated' || ev.type === 'manual_charge') return 'generated';
  if (ev.type === 'upcoming_cycle') return 'future';
  return 'future';
}

function historyStatusFromEvent(ev: FinancialEvent, today: string): string {
  if (ev.type === 'upcoming_cycle') return 'Prevista';
  if (ev.type === 'invoice_due' && ev.dueYmd && ev.dueYmd < today) return 'Atrasada';
  if (ev.type === 'invoice_generated' || ev.type === 'manual_charge') return 'Emitida';
  return ev.statusLabel;
}

/**
 * Próxima cobrança elegível — primeiro ciclo em subscription_cycles sem invoice.
 */
export function resolveNextChargeEvent(
  events: FinancialEvent[],
  detail: CrmSubscriptionDetailPayload
): FinancialEvent | null {
  const firstResolved = resolveOperationalCompetency(detail, { mode: 'NEXT_GENERATE' });
  const first = firstResolved.cycleId
    ? detail.cycles_raw?.find((c) => c.id === firstResolved.cycleId) ?? null
    : null;
  if (!first) return null;
  return events.find((e) => e.cycleId === first.id) ?? null;
}

export function hasFuturePredictedEvents(
  events: FinancialEvent[],
  detail: CrmSubscriptionDetailPayload
): boolean {
  return resolveNextChargeEvent(events, detail) != null;
}

export function financialEventToHistoryRow(
  ev: FinancialEvent,
  today: string,
  flags: { isNextCharge?: boolean; canGenerateNow?: boolean; isProjected?: boolean } = {}
): FinancialHistoryRow {
  const projected = flags.isProjected ?? isProjectedFinancialEvent(ev);
  return {
    id: ev.invoiceId ?? ev.cycleId ?? ev.id,
    competence: ev.competence ?? '—',
    amountCents: ev.amountCents,
    dueYmd: ev.dueYmd ?? ev.ymd,
    paidAt: ev.paidAt,
    statusPt: projected ? 'Prevista' : historyStatusFromEvent(ev, today),
    gateway: ev.gateway,
    invoiceId: ev.invoiceId,
    cycleId: ev.cycleId,
    visual: visualFromEventType(ev, today),
    notes: ev.notes,
    jobId: null,
    eventType: ev.type,
    isNextCharge: flags.isNextCharge ?? false,
    canGenerateNow: projected ? false : (flags.canGenerateNow ?? false),
    isProjected: projected,
  };
}

export function resolveNextChargePresentation(
  detail: CrmSubscriptionDetailPayload,
  displayEvents: FinancialEvent[],
  todayYmd?: string,
  realEvents?: FinancialEvent[]
): NextChargePresentation {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const billingEvents = realEvents ?? displayEvents.filter((e) => !isProjectedFinancialEvent(e));
  const nextEv = resolveNextChargeEvent(billingEvents, detail);
  const projectedEv = !nextEv ? resolveFirstProjectedEvent(displayEvents, today) : null;
  const sourceEv = nextEv ?? projectedEv;
  const isProjected = Boolean(projectedEv && !nextEv);

  const dueYmd = sourceEv?.dueYmd ?? sourceEv?.ymd ?? null;
  const firstCycleResolved = resolveOperationalCompetency(detail, { mode: 'NEXT_CARD' });
  const firstCycle = firstCycleResolved.cycleId
    ? detail.cycles_raw?.find((c) => c.id === firstCycleResolved.cycleId) ?? null
    : null;
  const cycleInvoiceId = firstCycle?.invoice_id?.trim() || nextEv?.invoiceId?.trim() || null;
  const hasInvoice = Boolean(cycleInvoiceId);
  const paused = detail.subscription.status === 'paused';
  const cancelled = detail.subscription.status === 'cancelled';

  const timelineRow = firstCycle
    ? detail.timeline.find((r) => r.cycle_id === firstCycle.id)
    : undefined;

  const ocreNext = resolveOperationalCompetency(detail, { mode: 'NEXT_CARD' });

  let statusKey: NextInvoiceExperience['statusKey'] = 'pending';
  let statusLabel = ocreNext.statusLabel;
  if (paused) {
    statusKey = 'paused';
    statusLabel = 'Pausada';
  } else if (cancelled) {
    statusKey = 'cancelled';
    statusLabel = 'Cancelada';
  } else if (hasInvoice) {
    statusKey = 'issued';
    statusLabel = ocreNext.canOpen ? 'Pendente' : statusLabel;
  } else if (isProjected) {
    statusKey = 'pending';
    statusLabel = 'Prevista';
  } else if (nextEv?.type === 'upcoming_cycle') {
    statusKey = 'pending';
    statusLabel = ocreNext.statusLabel;
  }

  const amountCents = sourceEv?.amountCents ?? detail.subscription.amount_cents;
  const periodEnd =
    normalizeYmdInput(timelineRow?.period_end) ??
    (dueYmd && !isProjected
      ? advanceBillingDueYmd(dueYmd, detail.subscription.billing_interval)
      : dueYmd
        ? projectedPeriodEnd(dueYmd, detail.subscription.billing_interval)
        : null);

  return {
    eventId: sourceEv?.id ?? null,
    eventType: sourceEv?.type ?? null,
    cycleId: isProjected ? null : (nextEv?.cycleId ?? firstCycle?.id ?? timelineRow?.cycle_id ?? null),
    isProjected,
    dueYmd,
    dateLabel: dueYmd ? formatNextInvoiceDateLong(dueYmd) : '—',
    dateLabelShort: dueYmd ? formatEventDateShort(dueYmd) : '—',
    amountCents,
    amountLabel: formatEventAmount(amountCents),
    competenceLabel: formatCompetenceRange(
      isProjected ? dueYmd : (timelineRow?.period_start ?? dueYmd),
      periodEnd,
      dueYmd
    ),
    statusKey,
    statusLabel,
    invoiceId: cycleInvoiceId,
    invoiceDisplayRef: cycleInvoiceId
      ? `#${cycleInvoiceId.replace(/-/g, '').slice(-4).toUpperCase()}`
      : null,
    hasInvoice,
    action: isProjected ? 'generate' : hasInvoice ? 'open' : 'generate',
    actionLabel: isProjected
      ? 'Previsão'
      : hasInvoice
        ? 'Abrir cobrança'
        : 'Gerar cobrança',
    isRecoverableFailure: false,
    workerHistory: [],
    visible: !cancelled || Boolean(dueYmd),
  };
}

export function resolveNextChargePresentationFromStore(store: FinancialEventStore): NextChargePresentation {
  return resolveNextChargePresentation(store.detail, store.events, store.today, store.realEvents);
}

/** Alvo único da próxima cobrança no Histórico (alinha com Next Invoice Card). */
export type NextHistoryChargeTarget = {
  cycleId: string | null;
  dueYmd: string | null;
  isProjected: boolean;
};

export function resolveNextHistoryChargeTarget(
  detail: CrmSubscriptionDetailPayload,
  displayEvents: FinancialEvent[],
  todayYmd: string
): NextHistoryChargeTarget | null {
  const firstResolved = resolveOperationalCompetency(detail, { mode: 'NEXT_GENERATE' });
  const first = firstResolved.cycleId
    ? detail.cycles_raw?.find((c) => c.id === firstResolved.cycleId) ?? null
    : null;
  if (first) {
    return {
      cycleId: first.id,
      dueYmd: normalizeYmdInput(first.cycle_date),
      isProjected: false,
    };
  }
  const proj = resolveFirstProjectedEvent(displayEvents, todayYmd);
  if (!proj) return null;
  return {
    cycleId: null,
    dueYmd: proj.dueYmd ?? proj.ymd,
    isProjected: true,
  };
}

/** Linhas futuras previstas/projetadas que podem ser colapsadas no Histórico. */
export function isCollapsibleFutureHistoryRow(row: FinancialHistoryRow, todayYmd: string): boolean {
  if (row.invoiceId) return false;
  if (row.visual === 'paid' || row.statusPt === 'Pago') return false;
  if (row.isProjected) return true;
  const due = row.dueYmd ?? '';
  if (due >= todayYmd && (row.eventType === 'upcoming_cycle' || row.statusPt === 'Prevista')) {
    return true;
  }
  return false;
}

export function historyRowMatchesNextCharge(
  row: FinancialHistoryRow,
  target: NextHistoryChargeTarget
): boolean {
  if (target.isProjected) {
    return Boolean(row.isProjected && row.dueYmd === target.dueYmd);
  }
  return row.cycleId === target.cycleId;
}

/** Histórico: todas as passadas + apenas a próxima cobrança futura (Sprint 4.2I). */
export function filterHistoryToSingleFutureCharge(
  rows: FinancialHistoryRow[],
  detail: CrmSubscriptionDetailPayload,
  displayEvents: FinancialEvent[],
  todayYmd: string
): FinancialHistoryRow[] {
  const target = resolveNextHistoryChargeTarget(detail, displayEvents, todayYmd);
  if (!target) return rows;

  return rows
    .filter((row) => {
      if (!isCollapsibleFutureHistoryRow(row, todayYmd)) return true;
      return historyRowMatchesNextCharge(row, target);
    })
    .map((row) => {
      const isNext = historyRowMatchesNextCharge(row, target);
      return {
        ...row,
        isNextCharge: isNext,
        canGenerateNow: isNext ? row.canGenerateNow : false,
      };
    });
}

/** IDs de eventos no calendário (paridade de validação). */
export function calendarEventIds(events: FinancialEvent[]): Set<string> {
  return new Set(events.map((e) => e.id));
}

export function historyRowIdsFromEvents(
  events: FinancialEvent[],
  detail: CrmSubscriptionDetailPayload
): Set<string> {
  const nextChargeId = resolveNextChargeEvent(events, detail)?.id ?? null;
  const HISTORY_TYPES: FinancialEventType[] = [
    'payment',
    'invoice_generated',
    'invoice_due',
    'invoice_failed',
    'invoice_cancelled',
    'invoice_reprocessed',
    'invoice_refunded',
    'manual_charge',
    'charge_attempt',
    'upcoming_cycle',
  ];
  const byCycle = new Map<string, FinancialEvent>();
  for (const ev of events) {
    if (!HISTORY_TYPES.includes(ev.type)) continue;
    const existing = byCycle.get(ev.cycleKey);
    if (!existing || eventTypePriority(ev.type) < eventTypePriority(existing.type)) {
      byCycle.set(ev.cycleKey, ev);
    }
  }
  return new Set([...byCycle.values()].map((ev) => ev.invoiceId ?? ev.cycleId ?? ev.id));
}
