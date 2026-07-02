import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { shiftMonthKey } from './billingSubscriptionExperiencePolish';
import { intervalLabel } from '@/components/subscriptions/subscriptionsListUtils';
import { subscriptionHeadlineStatus } from './billingSubscriptionExperience';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import type { CalendarVisualKind } from './billingSubscriptionExperience';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import {
  financialEventToHistoryRow,
  resolveNextChargeEvent,
  resolveNextChargePresentationFromStore,
} from './subscriptionFinancialEvents';
import { resolveHistoryRowState } from './billingStateMachine';
import type { FinancialEvent, FinancialEventType } from './financialEventTypes';
import {
  HISTORY_EVENT_TYPES,
  KPI_OPEN_TYPES,
  KPI_PAYMENT_TYPES,
  UPCOMING_EVENT_TYPES,
} from './financialEventTypes';
import {
  eventEmoji,
  eventToCalendarKind,
  eventTypePriority,
  formatEventAmount,
  formatEventDateShort,
  groupEventsByDay,
  pickPrimaryEvent,
  sortEventsByPriority,
  timelineIcon,
  timelineTitle,
} from './financialEventHelpers';
import type {
  FinancialCalendarEvent,
  FinancialHistoryFilter,
  FinancialHistorySort,
  FinancialInsight,
  FinancialKpiCard,
  FinancialTimelineItem,
  FinancialTimelineMonthGroup,
  UpcomingReceipt,
} from './subscriptionFinancialExperience';
import type { FinancialMonthOverview } from './subscriptionFinancialConsistency';
import { buildFinancialMonthOverview } from './subscriptionFinancialConsistency';
import { buildFinancialInsights } from './financialInsightsEngine';
import { buildUpcomingAgenda, nextAgendaHighlight, type UpcomingAgendaItem } from './financialUpcomingAgenda';
import { reorderKpiCards } from './subscriptionFinancialOverview';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatCentsCompact(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(v);
  }
  return formatEventAmount(cents);
}

function visualFromEvent(ev: FinancialEvent, today: string): CalendarVisualKind {
  if (ev.type === 'payment') return 'paid';
  if (ev.type === 'invoice_failed' || ev.type === 'charge_attempt') return 'overdue';
  if (ev.type === 'invoice_cancelled' || ev.type === 'invoice_refunded') return 'cancelled';
  if (ev.type === 'invoice_reprocessed') return 'reprocessed';
  if (ev.dueYmd && ev.dueYmd < today && ev.type === 'invoice_due') return 'overdue';
  if (ev.type === 'invoice_generated' || ev.type === 'manual_charge') return 'generated';
  return 'future';
}

export class FinancialEventStore {
  readonly events: FinancialEvent[];
  readonly subscriptionId: string;
  readonly today: string;
  readonly builtAt: string;

  private _calendarCache: FinancialCalendarEvent[] | null = null;
  private _historyCache: FinancialHistoryRow[] | null = null;
  private _timelineCache: FinancialTimelineItem[] | null = null;
  private _kpiCache: FinancialKpiCard[] | null = null;
  private _insightsCache: FinancialInsight[] | null = null;
  private _upcomingCache: UpcomingReceipt[] | null = null;
  private _byDayCache: Map<string, FinancialEvent[]> | null = null;

  constructor(
    private readonly detail: CrmSubscriptionDetailPayload,
    todayYmd?: string
  ) {
    this.today = todayYmd ?? new Date().toISOString().slice(0, 10);
    this.subscriptionId = detail.subscription.id;
    this.builtAt = new Date().toISOString();
    this.events = buildFinancialEvents(detail, this.today);
  }

  getEventsByDay(): Map<string, FinancialEvent[]> {
    if (!this._byDayCache) this._byDayCache = groupEventsByDay(this.events);
    return this._byDayCache;
  }

  getEventsForDay(ymd: string): FinancialEvent[] {
    return this.getEventsByDay().get(ymd) ?? [];
  }

  getEventsForMonth(monthKey: string): FinancialEvent[] {
    return this.events.filter((e) => e.ymd.startsWith(monthKey));
  }

  getCalendarEvents(): FinancialCalendarEvent[] {
    if (this._calendarCache) return this._calendarCache;
    this._calendarCache = this.events.map((ev) => {
      const overdue = ev.type === 'invoice_due' && Boolean(ev.dueYmd && ev.dueYmd < this.today);
      const kind = eventToCalendarKind(ev.type, overdue);
      return {
        id: ev.id,
        ymd: ev.ymd,
        kind,
        emoji: eventEmoji(ev.type),
        title: timelineTitle(ev.type),
        amountCents: ev.amountCents,
        competence: ev.competence,
        invoiceId: ev.invoiceId,
        statusPt: ev.statusLabel,
        gateway: ev.gateway,
        paidAt: ev.paidAt,
        clientName: ev.clientName,
        lastUpdatedAt: ev.lastUpdatedAt,
        cycleId: ev.cycleId,
        notes: ev.notes,
      };
    });
    return this._calendarCache;
  }

  getHistoryRows(): FinancialHistoryRow[] {
    if (this._historyCache) return this._historyCache;
    const nextCharge = resolveNextChargeEvent(this.events, this.today);
    const nextChargeId = nextCharge?.id ?? null;
    const HISTORY_TYPES: FinancialEventType[] = [...HISTORY_EVENT_TYPES, 'upcoming_cycle'];
    const byCycle = new Map<string, FinancialEvent>();
    for (const ev of this.events) {
      if (!HISTORY_TYPES.includes(ev.type)) continue;
      // Histórico exibe apenas a próxima cobrança prevista; demais ficam no calendário.
      if (ev.type === 'upcoming_cycle' && ev.id !== nextChargeId) continue;
      const existing = byCycle.get(ev.cycleKey);
      if (!existing || eventTypePriority(ev.type) < eventTypePriority(existing.type)) {
        byCycle.set(ev.cycleKey, ev);
      }
    }
    this._historyCache = [...byCycle.values()]
      .map((ev) => {
        const row = financialEventToHistoryRow(ev, this.today, {
          isNextCharge: ev.id === nextChargeId,
          canGenerateNow: ev.id === nextChargeId && !ev.invoiceId && ev.type === 'upcoming_cycle',
        });
        const state = resolveHistoryRowState(row, this.today);
        return {
          ...row,
          canGenerateNow: state.showGenerateButton,
          statusPt: state.label === '—' ? row.statusPt : state.label,
        };
      })
      .sort((a, b) => (b.dueYmd ?? '').localeCompare(a.dueYmd ?? ''));
    return this._historyCache;
  }

  filterHistory(
    filter: FinancialHistoryFilter,
    search: string,
    sort: FinancialHistorySort
  ): FinancialHistoryRow[] {
    const q = search.trim().toLowerCase();
    let rows = this.getHistoryRows().filter((row) => {
      const cat = this.historyCategory(row);
      if (filter !== 'all' && cat !== filter) return false;
      if (!q) return true;
      const hay = [row.competence, row.invoiceId, row.amountCents != null ? String(row.amountCents / 100) : '', row.statusPt]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'due_asc':
          return (a.dueYmd ?? '').localeCompare(b.dueYmd ?? '');
        case 'amount_desc':
          return (b.amountCents ?? 0) - (a.amountCents ?? 0);
        case 'amount_asc':
          return (a.amountCents ?? 0) - (b.amountCents ?? 0);
        default:
          return (b.dueYmd ?? '').localeCompare(a.dueYmd ?? '');
      }
    });
    return rows;
  }

  private historyCategory(row: FinancialHistoryRow): FinancialHistoryFilter {
    if (row.statusPt === 'Prevista' || row.visual === 'future') return 'pending';
    if (row.statusPt === 'Reembolsada') return 'refunded';
    if (row.visual === 'cancelled' || row.statusPt === 'Cancelado') return 'cancelled';
    if (row.visual === 'paid' || row.statusPt === 'Pago') return 'paid';
    if (row.visual === 'overdue' || row.statusPt === 'Atrasada') return 'overdue';
    return 'pending';
  }

  getTimelineItems(): FinancialTimelineItem[] {
    if (this._timelineCache) return this._timelineCache;
    this._timelineCache = this.events
      .filter((e) => HISTORY_EVENT_TYPES.includes(e.type) || e.type === 'upcoming_cycle')
      .map((ev) => ({
        id: ev.id,
        ymd: ev.ymd,
        icon: timelineIcon(ev.type),
        title: timelineTitle(ev.type),
        amountCents: ev.amountCents,
        dateLabel: formatEventDateShort(ev.ymd),
        subtitle: ev.notes,
        eventType: ev.type,
        invoiceId: ev.invoiceId,
      }))
      .sort((a, b) => b.ymd.localeCompare(a.ymd));
    return this._timelineCache;
  }

  getTimelineMonthGroups(): FinancialTimelineMonthGroup[] {
    const byMonth = new Map<string, FinancialTimelineItem[]>();
    for (const item of this.getTimelineItems()) {
      const mk = item.ymd.slice(0, 7);
      const list = byMonth.get(mk) ?? [];
      list.push(item);
      byMonth.set(mk, list);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, items]) => {
        const mi = Number(monthKey.slice(5, 7)) - 1;
        const paidItems = items.filter((i) => i.icon === '💰');
        const total = paidItems.reduce((s, i) => s + (i.amountCents ?? 0), 0);
        return {
          monthKey,
          monthLabel: mi >= 0 ? MONTH_NAMES[mi] : monthKey,
          summaryTitle: paidItems.length > 0 ? 'Recebeu' : 'Movimentação',
          totalCents: total,
          count: items.length,
          items: items.sort((a, b) => b.ymd.localeCompare(a.ymd)),
        };
      });
  }

  getKpiCards(): FinancialKpiCard[] {
    if (this._kpiCache) return this._kpiCache;
    const payments = this.events.filter((e) => KPI_PAYMENT_TYPES.includes(e.type));
    const open = this.events.filter((e) => KPI_OPEN_TYPES.includes(e.type));
    const receivedTotal = payments.reduce((s, e) => s + (e.amountCents ?? 0), 0);
    const openTotal = open.reduce((s, e) => s + (e.amountCents ?? 0), 0);
    const lastPayment = [...payments].sort((a, b) => b.ymd.localeCompare(a.ymd))[0];
    const nextUpcoming = this.events
      .filter((e) => e.type === 'upcoming_cycle' || (e.type === 'invoice_due' && e.dueYmd && e.dueYmd >= this.today))
      .sort((a, b) => a.ymd.localeCompare(b.ymd))[0];
    const upcomingSum = this.events
      .filter((e) => e.type === 'upcoming_cycle')
      .reduce((s, e) => s + (e.amountCents ?? 0), 0);

    const monthKey = this.today.slice(0, 7);
    const prevKey = shiftMonthKey(monthKey, -1);
    const currPaid = payments.filter((e) => e.ymd.startsWith(monthKey)).reduce((s, e) => s + (e.amountCents ?? 0), 0);
    const prevPaid = payments.filter((e) => e.ymd.startsWith(prevKey)).reduce((s, e) => s + (e.amountCents ?? 0), 0);
    let comparisonPct: number | null = null;
    if (prevPaid > 0) comparisonPct = Math.round(((currPaid - prevPaid) / prevPaid) * 100);
    else if (currPaid > 0) comparisonPct = 100;

    const head = subscriptionHeadlineStatus(this.detail);

    this._kpiCache = reorderKpiCards([
      {
        key: 'received',
        label: 'Recebido',
        primary: formatCentsCompact(receivedTotal),
        secondary: comparisonPct != null ? `${comparisonPct >= 0 ? '↑' : '↓'} ${Math.abs(comparisonPct)}% este mês` : null,
        comparisonPct,
      },
      {
        key: 'open',
        label: 'Em aberto',
        primary: formatCentsCompact(openTotal),
        secondary: null,
        comparisonPct: null,
      },
      {
        key: 'next_receipt',
        label: 'Próximo recebimento',
        primary: nextUpcoming ? formatEventDateShort(nextUpcoming.ymd) : '—',
        secondary: nextUpcoming?.amountCents != null ? formatCentsCompact(nextUpcoming.amountCents) : null,
        comparisonPct: null,
      },
      {
        key: 'forecast_12m',
        label: 'Receita prevista (12 meses)',
        primary: formatCentsCompact(upcomingSum + receivedTotal),
        secondary: null,
        comparisonPct: null,
      },
      {
        key: 'last_payment',
        label: 'Último pagamento',
        primary: lastPayment ? formatEventDateShort(lastPayment.ymd) : '—',
        secondary: lastPayment?.amountCents != null ? formatCentsCompact(lastPayment.amountCents) : null,
        comparisonPct: null,
      },
      {
        key: 'status',
        label: 'Status',
        primary: head.label,
        secondary: this.detail.meta.periodicity_label_pt,
        comparisonPct: null,
      },
    ]);
    return this._kpiCache;
  }

  getInsights(): FinancialInsight[] {
    if (this._insightsCache) return this._insightsCache;
    this._insightsCache = buildFinancialInsights(this.events, this.detail, this.today);
    return this._insightsCache;
  }

  getUpcomingAgenda(maxItems = 5): UpcomingAgendaItem[] {
    return buildUpcomingAgenda(this.events, this.today, maxItems);
  }

  getNextAgendaEvent(): UpcomingAgendaItem | null {
    return nextAgendaHighlight(this.getUpcomingAgenda(5));
  }

  getUpcomingReceipts(): UpcomingReceipt[] {
    if (this.detail.subscription.status === 'cancelled') {
      this._upcomingCache = [];
      return [];
    }
    if (this._upcomingCache) return this._upcomingCache;
    const seen = new Set<string>();
    const items: UpcomingReceipt[] = [];
    const paused = this.detail.subscription.status === 'paused';
    for (const ev of sortEventsByPriority(this.events)) {
      if (!UPCOMING_EVENT_TYPES.includes(ev.type)) continue;
      if (ev.type === 'invoice_due' && ev.dueYmd && ev.dueYmd < this.today) continue;
      if (seen.has(ev.ymd)) continue;
      seen.add(ev.ymd);
      const statusLabel =
        ev.type === 'upcoming_cycle' ? (paused ? 'Pausado' : 'Prevista') : ev.statusLabel;
      items.push({
        id: ev.id,
        ymd: ev.ymd,
        dateLabel: formatEventDateShort(ev.ymd),
        amountCents: ev.amountCents ?? this.detail.subscription.amount_cents,
        statusLabel,
      });
    }
    this._upcomingCache = items.sort((a, b) => a.ymd.localeCompare(b.ymd));
    return this._upcomingCache;
  }

  getMonthOverview(): FinancialMonthOverview[] {
    return buildFinancialMonthOverview(this.detail, this.today);
  }

  getNextChargeEvent(): FinancialEvent | null {
    return resolveNextChargeEvent(this.events, this.today);
  }

  getNextChargePresentation() {
    return resolveNextChargePresentationFromStore(this);
  }

  getSidebarSummary() {
    const payments = this.events.filter((e) => e.type === 'payment');
    const last = [...payments].sort((a, b) => b.ymd.localeCompare(a.ymd))[0];
    const nextCharge = this.getNextChargePresentation();
    const open = this.events
      .filter((e) => KPI_OPEN_TYPES.includes(e.type))
      .reduce((s, e) => s + (e.amountCents ?? 0), 0);
    return {
      nextReceiptDate: nextCharge.dateLabelShort !== '—' ? nextCharge.dateLabelShort : '—',
      nextReceiptAmount: nextCharge.amountLabel !== '—' ? nextCharge.amountLabel : '—',
      lastPaymentDate: last ? formatEventDateShort(last.ymd) : '—',
      lastPaymentAmount: last?.amountCents != null ? formatCentsCompact(last.amountCents) : '—',
      openAmount: formatCentsCompact(open),
      annualRevenue: formatCentsCompact(this.detail.subscription.amount_cents * 12),
      nextEventDate: this.getNextAgendaEvent()?.dateLabel ?? '—',
      nextEventTitle: this.getNextAgendaEvent()?.title ?? '—',
    };
  }

  searchEvents(query: string): FinancialEvent[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.events;
    return this.events.filter((ev) =>
      [ev.competence, ev.invoiceId, ev.statusLabel, ev.ymd, ev.type]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }

  pickPrimaryForDay(ymd: string): FinancialEvent | undefined {
    return pickPrimaryEvent(this.getEventsForDay(ymd));
  }

  getPaymentEventIds(): Set<string> {
    return new Set(this.events.filter((e) => e.type === 'payment').map((e) => e.id));
  }

  getEventById(id: string): FinancialEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  getEventsByType(type: FinancialEventType): FinancialEvent[] {
    return this.events.filter((e) => e.type === type);
  }
}

export function createFinancialEventStore(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialEventStore {
  return new FinancialEventStore(detail, todayYmd);
}

export function financialEventStoreSignature(detail: CrmSubscriptionDetailPayload): string {
  const tl = detail.timeline
    .filter((r) => r.merge_source !== 'lifecycle')
    .map((r) => `${r.cycle_id}:${r.invoice_id}:${r.operational_state}:${r.due_date}`)
    .join('|');
  return `${detail.subscription.id}:${detail.subscription.status}:${detail.subscription.next_billing_date}:${detail.latest_invoice_id ?? ''}:${tl}`;
}
