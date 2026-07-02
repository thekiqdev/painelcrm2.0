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
 * Primeira competência prevista elegível para destaque / Gerar agora.
 * Corresponde ao primeiro `upcoming_cycle` sem invoice (por vencimento crescente).
 */
export function resolveNextChargeEvent(events: FinancialEvent[], todayYmd: string): FinancialEvent | null {
  const predicted = events
    .filter((e) => e.type === 'upcoming_cycle' && !e.invoiceId && e.dueYmd)
    .sort((a, b) => a.dueYmd!.localeCompare(b.dueYmd!));

  const future = predicted.filter((e) => e.dueYmd! >= todayYmd);
  if (future.length > 0) return future[0]!;
  return predicted[0] ?? null;
}

export function hasFuturePredictedEvents(events: FinancialEvent[], todayYmd: string): boolean {
  return resolveNextChargeEvent(events, todayYmd) != null;
}

export function financialEventToHistoryRow(
  ev: FinancialEvent,
  today: string,
  flags: { isNextCharge?: boolean; canGenerateNow?: boolean } = {}
): FinancialHistoryRow {
  return {
    id: ev.invoiceId ?? ev.cycleId ?? ev.id,
    competence: ev.competence ?? '—',
    amountCents: ev.amountCents,
    dueYmd: ev.dueYmd ?? ev.ymd,
    paidAt: ev.paidAt,
    statusPt: historyStatusFromEvent(ev, today),
    gateway: ev.gateway,
    invoiceId: ev.invoiceId,
    visual: visualFromEventType(ev, today),
    notes: ev.notes,
    jobId: null,
    eventType: ev.type,
    isNextCharge: flags.isNextCharge ?? false,
    canGenerateNow: flags.canGenerateNow ?? false,
  };
}

export function resolveNextChargePresentation(
  detail: CrmSubscriptionDetailPayload,
  events: FinancialEvent[],
  todayYmd?: string
): NextChargePresentation {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const nextEv = resolveNextChargeEvent(events, today);
  const dueYmd = nextEv?.dueYmd ?? nextEv?.ymd ?? null;
  const hasInvoice = Boolean(nextEv?.invoiceId);
  const paused = detail.subscription.status === 'paused';
  const cancelled = detail.subscription.status === 'cancelled';

  let statusKey: NextInvoiceExperience['statusKey'] = 'pending';
  let statusLabel = 'Prevista';
  if (paused) {
    statusKey = 'paused';
    statusLabel = 'Pausada';
  } else if (cancelled) {
    statusKey = 'cancelled';
    statusLabel = 'Cancelada';
  } else if (hasInvoice) {
    statusKey = 'issued';
    statusLabel = 'Pendente';
  } else if (nextEv?.type === 'upcoming_cycle') {
    statusKey = 'pending';
    statusLabel = 'Prevista';
  }

  const amountCents = nextEv?.amountCents ?? detail.subscription.amount_cents;
  const timelineRow = dueYmd
    ? detail.timeline.find((r) => {
        const d = normalizeYmdInput(r.due_date) ?? normalizeYmdInput(r.cycle_date);
        return d === dueYmd;
      })
    : undefined;
  const periodEnd =
    normalizeYmdInput(timelineRow?.period_end) ??
    (dueYmd ? advanceBillingDueYmd(dueYmd, detail.subscription.billing_interval) : null);

  return {
    eventId: nextEv?.id ?? null,
    eventType: nextEv?.type ?? null,
    dueYmd,
    dateLabel: dueYmd ? formatNextInvoiceDateLong(dueYmd) : '—',
    dateLabelShort: dueYmd ? formatEventDateShort(dueYmd) : '—',
    amountCents,
    amountLabel: formatEventAmount(amountCents),
    competenceLabel: formatCompetenceRange(timelineRow?.period_start ?? dueYmd, periodEnd, dueYmd),
    statusKey,
    statusLabel,
    invoiceId: nextEv?.invoiceId ?? null,
    invoiceDisplayRef: nextEv?.invoiceId
      ? `#${nextEv.invoiceId.replace(/-/g, '').slice(-4).toUpperCase()}`
      : null,
    hasInvoice,
    action: hasInvoice ? 'open' : 'generate',
    actionLabel: hasInvoice ? 'Abrir cobrança' : 'Gerar cobrança',
    isRecoverableFailure: false,
    workerHistory: [],
    visible: !cancelled || Boolean(dueYmd),
  };
}

export function resolveNextChargePresentationFromStore(store: FinancialEventStore): NextChargePresentation {
  return resolveNextChargePresentation(store.detail, store.events, store.today);
}

/** IDs de eventos no calendário (paridade de validação). */
export function calendarEventIds(events: FinancialEvent[]): Set<string> {
  return new Set(events.map((e) => e.id));
}

export function historyRowIdsFromEvents(events: FinancialEvent[], today: string): Set<string> {
  const nextChargeId = resolveNextChargeEvent(events, today)?.id ?? null;
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
    if (ev.type === 'upcoming_cycle' && ev.id !== nextChargeId) continue;
    const existing = byCycle.get(ev.cycleKey);
    if (!existing || eventTypePriority(ev.type) < eventTypePriority(existing.type)) {
      byCycle.set(ev.cycleKey, ev);
    }
  }
  return new Set([...byCycle.values()].map((ev) => ev.invoiceId ?? ev.cycleId ?? ev.id));
}
