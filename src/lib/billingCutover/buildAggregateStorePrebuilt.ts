/**
 * Sprint 5.0-22B — Constrói prebuilt completo do FinancialEventStore a partir do BillingAggregate.
 */
import type { BillingAggregate } from '@/lib/billingAggregate';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { buildFinancialInsights } from '@/lib/financialInsightsEngine';
import { buildUpcomingAgenda, nextAgendaHighlight } from '@/lib/financialUpcomingAgenda';
import { reorderKpiCards } from '@/lib/subscriptionFinancialOverview';
import type {
  FinancialCalendarEvent,
  FinancialHeaderData,
  FinancialInsight,
  FinancialKpiCard,
  UpcomingReceipt,
} from '@/lib/subscriptionFinancialExperience';
import type { FinancialHistoryRow } from '@/lib/billingSubscriptionExperience';
import type { FinancialEvent } from '@/lib/financialEventTypes';
import type { NextChargePresentation } from '@/lib/subscriptionFinancialEvents';
import type { FinancialAlert } from '@/lib/subscriptionFinancialExperience';
import type { TechnicalAccordionView } from './adapters/technicalAdapter';
import { humanizeAggregateAlerts } from './alertHumanizer';
import { buildStoreEventsFromAggregate } from './billingViewAdapter';
import { buildCalendarEventsFromAggregate } from './adapters/calendarAdapter';
import { buildHeaderDataFromAggregate } from './adapters/headerAdapter';
import { buildHistoryRowsFromAggregate } from './adapters/historyAdapter';
import { buildNextChargePresentationFromAggregate } from './adapters/nextInvoiceAdapter';
import { buildSidebarSummaryFromAggregate } from './adapters/sidebarAdapter';
import { buildTechnicalAccordionViewFromAggregate } from './adapters/technicalAdapter';
import {
  buildUiCapabilitiesFromAggregate,
  type BillingUiCapabilities,
} from './adapters/uiCapabilitiesAdapter';
import { formatCentsCompact } from '@/lib/billingAggregate/aggregateDateUtils';
import { formatEventDateShort } from '@/lib/financialEventHelpers';
import { shiftMonthKey } from '@/lib/billingSubscriptionExperiencePolish';
import { KPI_OPEN_TYPES, KPI_PAYMENT_TYPES } from '@/lib/financialEventTypes';
import { isProjectedFinancialEvent } from '@/lib/subscriptionFinancialProjection';
import type { SidebarSummaryView } from './adapters/sidebarAdapter';

export type FinancialEventStorePrebuilt = {
  realEvents: FinancialEvent[];
  events: FinancialEvent[];
  historyRows: FinancialHistoryRow[];
  calendarEvents: FinancialCalendarEvent[];
  sidebarSummary: SidebarSummaryView;
  nextChargePresentation: NextChargePresentation;
  alerts: FinancialAlert[];
  uiCapabilities: BillingUiCapabilities;
  headerData: FinancialHeaderData;
  insights: FinancialInsight[];
  technicalView: TechnicalAccordionView;
  kpiCards: FinancialKpiCard[];
  upcomingReceipts: UpcomingReceipt[];
  aggregate: BillingAggregate;
};

function buildKpiCardsFromAggregate(
  aggregate: BillingAggregate,
  events: FinancialEvent[],
  realEvents: FinancialEvent[]
): FinancialKpiCard[] {
  const payments = realEvents.filter((e) => KPI_PAYMENT_TYPES.includes(e.type));
  const open = realEvents.filter((e) => KPI_OPEN_TYPES.includes(e.type));
  const receivedTotal = payments.reduce((s, e) => s + (e.amountCents ?? 0), 0);
  const openTotal = open.reduce((s, e) => s + (e.amountCents ?? 0), 0);
  const lastPayment = [...payments].sort((a, b) => b.ymd.localeCompare(a.ymd))[0];
  const nextUpcoming = events
    .filter(
      (e) =>
        e.type === 'upcoming_cycle' ||
        (e.type === 'invoice_due' && e.dueYmd && e.dueYmd >= aggregate.todayYmd)
    )
    .sort((a, b) => a.ymd.localeCompare(b.ymd))[0];
  const upcomingSum = events
    .filter((e) => e.type === 'upcoming_cycle')
    .reduce((s, e) => s + (e.amountCents ?? 0), 0);

  const monthKey = aggregate.todayYmd.slice(0, 7);
  const prevKey = shiftMonthKey(monthKey, -1);
  const currPaid = payments
    .filter((e) => e.ymd.startsWith(monthKey))
    .reduce((s, e) => s + (e.amountCents ?? 0), 0);
  const prevPaid = payments
    .filter((e) => e.ymd.startsWith(prevKey))
    .reduce((s, e) => s + (e.amountCents ?? 0), 0);
  let comparisonPct: number | null = null;
  if (prevPaid > 0) comparisonPct = Math.round(((currPaid - prevPaid) / prevPaid) * 100);
  else if (currPaid > 0) comparisonPct = 100;

  const headLabel =
    aggregate.subscription.status === 'active'
      ? 'Ativa'
      : aggregate.subscription.status === 'paused'
        ? 'Pausada'
        : aggregate.subscription.status === 'cancelled'
          ? 'Cancelada'
          : aggregate.subscription.status;

  return reorderKpiCards([
    {
      key: 'received',
      label: 'Recebido',
      primary: formatCentsCompact(receivedTotal),
      secondary:
        comparisonPct != null
          ? `${comparisonPct >= 0 ? '↑' : '↓'} ${Math.abs(comparisonPct)}% este mês`
          : null,
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
      secondary:
        nextUpcoming?.amountCents != null ? formatCentsCompact(nextUpcoming.amountCents) : null,
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
      secondary:
        lastPayment?.amountCents != null ? formatCentsCompact(lastPayment.amountCents) : null,
      comparisonPct: null,
    },
    {
      key: 'status',
      label: 'Status',
      primary: headLabel,
      secondary: aggregate.subscription.billingInterval,
      comparisonPct: null,
    },
  ]);
}

function buildUpcomingReceiptsFromEvents(
  aggregate: BillingAggregate,
  events: FinancialEvent[]
): UpcomingReceipt[] {
  if (aggregate.subscription.status === 'cancelled') return [];
  const paused = aggregate.subscription.status === 'paused';
  const items: UpcomingReceipt[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (ev.type !== 'upcoming_cycle' && ev.type !== 'invoice_due') continue;
    if (ev.type === 'invoice_due' && ev.dueYmd && ev.dueYmd < aggregate.todayYmd) continue;
    if (seen.has(ev.ymd)) continue;
    seen.add(ev.ymd);
    const statusLabel = isProjectedFinancialEvent(ev)
      ? paused
        ? 'Pausado'
        : 'Prevista'
      : ev.statusLabel;
    items.push({
      id: ev.id,
      ymd: ev.ymd,
      dateLabel: formatEventDateShort(ev.ymd),
      amountCents: ev.amountCents ?? aggregate.subscription.amount,
      statusLabel,
    });
  }
  return items.sort((a, b) => a.ymd.localeCompare(b.ymd));
}

/** Prebuilt completo — única fonte para a façade do FinancialEventStore. */
export function buildAggregateStorePrebuilt(
  aggregate: BillingAggregate,
  detail: CrmSubscriptionDetailPayload
): FinancialEventStorePrebuilt {
  const uiCapabilities = buildUiCapabilitiesFromAggregate(aggregate);
  const { realEvents, events } = buildStoreEventsFromAggregate(aggregate, detail);
  const historyRows = buildHistoryRowsFromAggregate(aggregate, uiCapabilities);
  const calendarEvents = buildCalendarEventsFromAggregate(aggregate, uiCapabilities);
  const sidebarSummary = buildSidebarSummaryFromAggregate(aggregate);
  const nextChargePresentation = buildNextChargePresentationFromAggregate(aggregate);
  const alerts = humanizeAggregateAlerts(aggregate.alerts);
  const headerData = buildHeaderDataFromAggregate(
    aggregate,
    detail.client_name,
    detail.meta?.periodicity_label_pt ?? null
  );
  const insights = buildFinancialInsights(realEvents, detail, aggregate.todayYmd);
  const technicalView = buildTechnicalAccordionViewFromAggregate(aggregate);
  const kpiCards = buildKpiCardsFromAggregate(aggregate, events, realEvents);
  const upcomingReceipts = buildUpcomingReceiptsFromEvents(aggregate, events);

  return {
    realEvents,
    events,
    historyRows,
    calendarEvents,
    sidebarSummary,
    nextChargePresentation,
    alerts,
    uiCapabilities,
    headerData,
    insights,
    technicalView,
    kpiCards,
    upcomingReceipts,
    aggregate,
  };
}

/** @deprecated use buildAggregateStorePrebuilt */
export type FinancialEventStorePrebuiltEvents = Pick<
  FinancialEventStorePrebuilt,
  'realEvents' | 'events'
>;
