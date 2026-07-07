import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { createBillingExperienceStore } from '@/lib/billingCutover/createBillingExperienceStore';
import type { FinancialEventStorePrebuilt } from '@/lib/billingCutover/buildAggregateStorePrebuilt';
import type { BillingUiCapabilities } from '@/lib/billingCutover/adapters/uiCapabilitiesAdapter';
import type { BillingAggregate } from '@/lib/billingAggregate';
import {
  buildFinancialHeaderData,
  buildFinancialAlerts,
  type FinancialHeaderData,
} from './subscriptionFinancialExperience';
import { humanizeFinancialAlerts } from '@/lib/subscriptionFinancialOverview';
import { shiftMonthKey } from './billingSubscriptionExperiencePolish';
import { intervalLabel } from '@/components/subscriptions/subscriptionsListUtils';
import { subscriptionHeadlineStatus } from './billingSubscriptionExperience';
import type { FinancialHistoryRow } from './billingSubscriptionExperience';
import type { CalendarVisualKind } from './billingSubscriptionExperience';
import { buildFinancialEvents } from './subscriptionFinancialEventBuilder';
import {
  buildProjectionEvents,
  isProjectedFinancialEvent,
  mergeRealAndProjectionEvents,
} from './subscriptionFinancialProjection';
import { invoiceVisibilityFromCycle, resolveCyclePresentation, cycleNeedsInvariantRepair } from './resolvedCompetencyPresentation';
import { resolveOperationalCompetency } from './operationalCompetencyResolver';
import {
  financialEventToHistoryRow,
  resolveNextChargeEvent,
  resolveNextChargePresentationFromStore,
} from './subscriptionFinancialEvents';
import { billingStatusLabel } from './billingStatusPresentation';
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

export type FinancialEventStorePrebuiltEvents = Pick<
  FinancialEventStorePrebuilt,
  'realEvents' | 'events'
>;

export type { FinancialEventStorePrebuilt };

export class FinancialEventStore {
  /** Eventos reais (subscription_cycles) — única fonte para Billing. */
  readonly realEvents: FinancialEvent[];
  /** Eventos reais + projeções UX (Sprint 4.2H). */
  readonly events: FinancialEvent[];
  readonly subscriptionId: string;
  readonly today: string;
  readonly builtAt: string;
  /** Presente quando alimentado pelo BillingAggregate (Sprint 5.0-22B). */
  readonly aggregateFacade: FinancialEventStorePrebuilt | null;

  private _calendarCache: FinancialCalendarEvent[] | null = null;
  private _historyCache: FinancialHistoryRow[] | null = null;
  private _timelineCache: FinancialTimelineItem[] | null = null;
  private _kpiCache: FinancialKpiCard[] | null = null;
  private _insightsCache: FinancialInsight[] | null = null;
  private _upcomingCache: UpcomingReceipt[] | null = null;
  private _byDayCache: Map<string, FinancialEvent[]> | null = null;
  private _nextChargeCache: ReturnType<FinancialEventStore['getNextChargePresentation']> | null = null;
  private _sidebarCache: ReturnType<FinancialEventStore['getSidebarSummary']> | null = null;
  private _alertsCache: import('./subscriptionFinancialExperience').FinancialAlert[] | null = null;

  constructor(
    readonly detail: CrmSubscriptionDetailPayload,
    todayYmd?: string,
    prebuilt?: FinancialEventStorePrebuilt | FinancialEventStorePrebuiltEvents
  ) {
    this.today = todayYmd ?? new Date().toISOString().slice(0, 10);
    this.subscriptionId = detail.subscription.id;
    this.builtAt = new Date().toISOString();
    const isFullFacade =
      prebuilt != null && 'historyRows' in prebuilt && Array.isArray(prebuilt.historyRows);
    this.aggregateFacade = isFullFacade ? (prebuilt as FinancialEventStorePrebuilt) : null;
    if (prebuilt) {
      this.realEvents = prebuilt.realEvents;
      this.events = prebuilt.events;
      if (this.aggregateFacade) {
        this._historyCache = this.aggregateFacade.historyRows;
        this._calendarCache = this.aggregateFacade.calendarEvents;
        this._kpiCache = this.aggregateFacade.kpiCards;
        this._insightsCache = this.aggregateFacade.insights;
        this._upcomingCache = this.aggregateFacade.upcomingReceipts;
        this._nextChargeCache = this.aggregateFacade.nextChargePresentation;
        this._sidebarCache = this.aggregateFacade.sidebarSummary;
        this._alertsCache = this.aggregateFacade.alerts;
      }
    } else {
      this.realEvents = buildFinancialEvents(detail, this.today);
      const projections = buildProjectionEvents(detail, this.today);
      this.events = mergeRealAndProjectionEvents(this.realEvents, projections);
    }
  }

  /** Aggregate certificado quando store é façade (5.0-22B). */
  getAggregate(): BillingAggregate | null {
    return this.aggregateFacade?.aggregate ?? null;
  }

  getUiCapabilities(): BillingUiCapabilities | null {
    return this.aggregateFacade?.uiCapabilities ?? null;
  }

  resolveCyclePresentation(
    cycleId: string | null | undefined,
    mode: import('./operationalCompetencyResolverCore').OperationalCompetencyMode = 'HISTORY',
    options?: Parameters<typeof resolveCyclePresentation>[3]
  ) {
    return resolveCyclePresentation(this.detail, cycleId, mode, options);
  }

  getHeaderData(): FinancialHeaderData | null {
    if (this.aggregateFacade?.headerData) return this.aggregateFacade.headerData;
    if (!this.aggregateFacade) return buildFinancialHeaderData(this.detail, this.today);
    return null;
  }

  getFinancialAlerts(): import('./subscriptionFinancialExperience').FinancialAlert[] {
    if (this._alertsCache) return this._alertsCache;
    if (!this.aggregateFacade) {
      return humanizeFinancialAlerts(buildFinancialAlerts(this.detail, this.today), this.detail, this.today);
    }
    return [];
  }

  getTechnicalView() {
    return this.aggregateFacade?.technicalView ?? null;
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
      const projected = isProjectedFinancialEvent(ev);
      const statusPt = projected
        ? 'Prevista'
        : billingStatusLabel({
            eventType: ev.type,
            overdue,
            isProjected: false,
            fallback: ev.statusLabel,
          });
      return {
        id: ev.id,
        ymd: ev.ymd,
        kind,
        emoji: eventEmoji(ev.type),
        title: projected ? 'Prevista' : timelineTitle(ev.type),
        amountCents: ev.amountCents,
        competence: ev.competence,
        invoiceId: ev.invoiceId,
        statusPt,
        gateway: ev.gateway,
        paidAt: ev.paidAt,
        clientName: ev.clientName,
        lastUpdatedAt: ev.lastUpdatedAt,
        cycleId: ev.cycleId,
        notes: ev.notes,
        isProjected: projected,
      };
    });
    return this._calendarCache;
  }

  getHistoryRows(): FinancialHistoryRow[] {
    if (this._historyCache) return this._historyCache;
    const nextResolved = resolveOperationalCompetency(this.detail, { mode: 'NEXT_GENERATE' });
    const nextCycleId = nextResolved.cycleId ?? null;
    const HISTORY_TYPES: FinancialEventType[] = [...HISTORY_EVENT_TYPES, 'upcoming_cycle'];
    const byCycle = new Map<string, FinancialEvent>();
    for (const ev of this.realEvents) {
      if (!HISTORY_TYPES.includes(ev.type)) continue;
      if (!ev.cycleId) continue;
      const existing = byCycle.get(ev.cycleKey);
      if (!existing || eventTypePriority(ev.type) < eventTypePriority(existing.type)) {
        byCycle.set(ev.cycleKey, ev);
      }
    }
    this._historyCache = [...byCycle.values()]
      .map((ev) => {
        const overdue = ev.type === 'invoice_due' && Boolean(ev.dueYmd && ev.dueYmd < this.today);
        const cycle = ev.cycleId
          ? this.detail.cycles_raw?.find((c) => c.id === ev.cycleId)
          : undefined;
        const vis = invoiceVisibilityFromCycle(
          cycle?.invoice_id ?? ev.invoiceId,
          this.detail.subscription.status
        );
        const needsInvariantRepair = cycle
          ? cycleNeedsInvariantRepair(cycle.status, cycle.invoice_id)
          : false;
        const row = financialEventToHistoryRow(ev, this.today, {
          isNextCharge: ev.cycleId === nextCycleId,
          canGenerateNow: needsInvariantRepair ? false : vis.canGenerate,
          isProjected: false,
        });
        return {
          ...row,
          invoiceId: cycle?.invoice_id ?? null,
          canGenerateNow: needsInvariantRepair ? false : vis.canGenerate,
          canOpenNow: needsInvariantRepair ? false : vis.canOpen,
          canReprocessNow: false,
          needsInvariantRepair,
          statusPt: billingStatusLabel({
            eventType: ev.type,
            cycleStatus: cycle?.status ?? null,
            overdue,
            isProjected: false,
            fallback: row.statusPt,
          }),
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
    if (row.isProjected || (row.statusPt === 'Prevista' && !row.cycleId)) return 'pending';
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
    const payments = this.realEvents.filter((e) => KPI_PAYMENT_TYPES.includes(e.type));
    const open = this.realEvents.filter((e) => KPI_OPEN_TYPES.includes(e.type));
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
    this._insightsCache = buildFinancialInsights(this.realEvents, this.detail, this.today);
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
      const statusLabel = isProjectedFinancialEvent(ev)
        ? this.detail.subscription.status === 'paused'
          ? 'Pausado'
          : 'Prevista'
        : ev.type === 'upcoming_cycle'
          ? paused
            ? 'Pausado'
            : 'Prevista'
          : ev.statusLabel;
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
    return resolveNextChargeEvent(this.realEvents, this.detail);
  }

  getNextChargePresentation() {
    if (this._nextChargeCache) return this._nextChargeCache;
    this._nextChargeCache = resolveNextChargePresentationFromStore(this);
    return this._nextChargeCache;
  }

  getSidebarSummary() {
    if (this._sidebarCache) return this._sidebarCache;
    const payments = this.realEvents.filter((e) => e.type === 'payment');
    const last = [...payments].sort((a, b) => b.ymd.localeCompare(a.ymd))[0];
    const nextCharge = this.getNextChargePresentation();
    const open = this.realEvents
      .filter((e) => KPI_OPEN_TYPES.includes(e.type))
      .reduce((s, e) => s + (e.amountCents ?? 0), 0);
    this._sidebarCache = {
      nextReceiptDate: nextCharge.dateLabelShort !== '—' ? nextCharge.dateLabelShort : '—',
      nextReceiptAmount: nextCharge.amountLabel !== '—' ? nextCharge.amountLabel : '—',
      lastPaymentDate: last ? formatEventDateShort(last.paidAt ?? last.ymd) : '—',
      lastPaymentAmount: last?.amountCents != null ? formatCentsCompact(last.amountCents) : '—',
      openAmount: formatCentsCompact(open),
      annualRevenue: formatCentsCompact(this.detail.subscription.amount_cents * 12),
      nextEventDate: this.getNextAgendaEvent()?.dateLabel ?? '—',
      nextEventTitle: this.getNextAgendaEvent()?.title ?? '—',
    };
    return this._sidebarCache;
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
    return new Set(this.realEvents.filter((e) => e.type === 'payment').map((e) => e.id));
  }

  getEventById(id: string): FinancialEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  getEventsByType(type: FinancialEventType): FinancialEvent[] {
    return this.events.filter((e) => e.type === type);
  }
}

export function financialEventStoreSignature(detail: CrmSubscriptionDetailPayload): string {
  const tl = detail.timeline
    .filter((r) => r.merge_source !== 'lifecycle')
    .map((r) => `${r.cycle_id}:${r.invoice_id}:${r.operational_state}:${r.due_date}`)
    .join('|');
  const cy = (detail.cycles_raw ?? [])
    .map((c) => `${c.id}:${c.cycle_date}:${c.status}:${c.invoice_id ?? ''}`)
    .join('|');
  return `${detail.subscription.id}:${detail.subscription.status}:${detail.subscription.next_billing_date}:${detail.latest_invoice_id ?? ''}:${tl}:${cy}`;
}

export function createFinancialEventStore(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialEventStore {
  return createBillingExperienceStore(detail, todayYmd);
}
