import type { BillingAggregate, BillingAggregateStage, BillingContext } from './types';
import { buildAlertsFromAggregate } from './alertsSnapshot';
import { buildCalendarFromEvents } from './calendarSnapshot';
import { buildCapabilitiesFromAggregate } from './capabilitiesSnapshot';
import { mapCyclesFromSource } from './cycleSnapshot';
import { buildFinancialEventsFromAggregate } from './financialEventSnapshot';
import { buildHistoryFromEvents } from './historySnapshot';
import { resolveNextInvoiceFromAggregate } from './nextInvoiceSnapshot';
import { buildProjectionEventsFromAggregate } from './projectionSnapshot';
import { buildSidebarFromAggregate } from './sidebarSnapshot';
import { mapSubscriptionSnapshot } from './subscriptionSnapshot';

/** Sprint 5.0-12 — popula `aggregate.subscription`. */
export const subscriptionStage: BillingAggregateStage = (context, aggregate) => ({
  ...aggregate,
  subscription: mapSubscriptionSnapshot(context.source.subscription),
});

/** Sprint 5.0-13 — popula `aggregate.cycles`. */
export const cycleStage: BillingAggregateStage = (context, aggregate) => ({
  ...aggregate,
  cycles: mapCyclesFromSource(context.source.cycles_raw, context.source.subscription.id),
});

/** Placeholder — timeline não é input de decisão. */
export const timelineStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-14 / 5.0-21B — eventos reais a partir de subscription + cycles + today. */
export const financialEventStage: BillingAggregateStage = (context, aggregate) => ({
  ...aggregate,
  events: buildFinancialEventsFromAggregate(
    aggregate.subscription,
    aggregate.cycles,
    context.todayYmd
  ),
});

/** Sprint 5.0-15 / 5.0-21B — history reais, ordenação dueYmd desc. */
export const historyStage: BillingAggregateStage = (_context, aggregate) => ({
  ...aggregate,
  history: buildHistoryFromEvents(aggregate.events),
});

/** Sprint 5.0-16 / 5.0-21B — calendar = reais + projeções. */
export const calendarStage: BillingAggregateStage = (_context, aggregate) => {
  const projections = buildProjectionEventsFromAggregate(
    aggregate.subscription,
    aggregate.cycles
  );
  return {
    ...aggregate,
    calendar: buildCalendarFromEvents([...aggregate.events, ...projections]),
  };
};

/** Sprint 5.0-18 / 5.0-21B — first eligible ou projeção. */
export const nextInvoiceStage: BillingAggregateStage = (context, aggregate) => {
  const projections = buildProjectionEventsFromAggregate(
    aggregate.subscription,
    aggregate.cycles
  );
  return {
    ...aggregate,
    nextInvoice: resolveNextInvoiceFromAggregate(
      aggregate.subscription,
      aggregate.cycles,
      [...aggregate.events, ...projections],
      context.todayYmd
    ),
  };
};

/** Sprint 5.0-17 / 5.0-21B — sidebar contrato UI. */
export const sidebarStage: BillingAggregateStage = (_context, aggregate) => ({
  ...aggregate,
  sidebar: buildSidebarFromAggregate(
    aggregate.subscription,
    aggregate.events,
    aggregate.nextInvoice
  ),
});

/** Sprint 5.0-19 / 5.0-21B — taxonomia legada de alertas. */
export const alertStage: BillingAggregateStage = (context, aggregate) => ({
  ...aggregate,
  alerts: buildAlertsFromAggregate(
    aggregate.subscription,
    aggregate.events,
    aggregate.nextInvoice,
    aggregate.cycles,
    context.todayYmd
  ),
});

/** Sprint 5.0-20 / 5.0-21B — capabilities alinhadas a Generate. */
export const capabilityStage: BillingAggregateStage = (_context, aggregate) => ({
  ...aggregate,
  capabilities: buildCapabilitiesFromAggregate({
    subscription: aggregate.subscription,
    cycles: aggregate.cycles,
    events: aggregate.events,
    history: aggregate.history,
    calendar: aggregate.calendar,
    sidebar: aggregate.sidebar,
    nextInvoice: aggregate.nextInvoice,
    alerts: aggregate.alerts,
  }),
});

export const technicalStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/**
 * Ordem canônica: NextInvoice antes de Sidebar (sidebar consome nextInvoice).
 * Calendar pode rodar antes de NextInvoice (independentes).
 */
export const BILLING_AGGREGATE_PIPELINE_STAGES: readonly BillingAggregateStage[] = [
  subscriptionStage,
  cycleStage,
  timelineStage,
  financialEventStage,
  historyStage,
  calendarStage,
  nextInvoiceStage,
  sidebarStage,
  alertStage,
  capabilityStage,
  technicalStage,
] as const;

export const BILLING_AGGREGATE_PIPELINE_STAGE_NAMES = [
  'SubscriptionStage',
  'CycleStage',
  'TimelineStage',
  'FinancialEventStage',
  'HistoryStage',
  'CalendarStage',
  'NextInvoiceStage',
  'SidebarStage',
  'AlertStage',
  'CapabilityStage',
  'TechnicalStage',
] as const;

export function runBillingAggregatePipeline(
  context: BillingContext,
  initial: BillingAggregate
): BillingAggregate {
  return BILLING_AGGREGATE_PIPELINE_STAGES.reduce(
    (aggregate, stage) => stage(context, aggregate),
    initial
  );
}
