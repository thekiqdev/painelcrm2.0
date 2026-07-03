import type { BillingAggregate, BillingAggregateStage, BillingContext } from './types';
import { mapCyclesFromSource } from './cycleSnapshot';
import { buildFinancialEventsFromAggregate } from './financialEventSnapshot';
import { buildHistoryFromEvents } from './historySnapshot';
import { mapSubscriptionSnapshot } from './subscriptionSnapshot';

/** Sprint 5.0-12 — popula `aggregate.subscription` a partir de `context.source.subscription`. */
export const subscriptionStage: BillingAggregateStage = (context, aggregate) => ({
  ...aggregate,
  subscription: mapSubscriptionSnapshot(context.source.subscription),
});

/** Sprint 5.0-13 — popula `aggregate.cycles` a partir de `context.source.cycles_raw`. */
export const cycleStage: BillingAggregateStage = (context, aggregate) => ({
  ...aggregate,
  cycles: mapCyclesFromSource(context.source.cycles_raw, context.source.subscription.id),
});

/** Sprint 5.0-11 — placeholder; popula `timeline` em sprint futura. */
export const timelineStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-14 — popula `aggregate.events` a partir de subscription + cycles. */
export const financialEventStage: BillingAggregateStage = (_context, aggregate) => ({
  ...aggregate,
  events: buildFinancialEventsFromAggregate(aggregate.subscription, aggregate.cycles),
});

/** Sprint 5.0-15 — popula `aggregate.history` exclusivamente a partir de `aggregate.events`. */
export const historyStage: BillingAggregateStage = (_context, aggregate) => ({
  ...aggregate,
  history: buildHistoryFromEvents(aggregate.events),
});

/** Sprint 5.0-11 — placeholder; popula `calendar` em sprint futura. */
export const calendarStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `sidebar` em sprint futura. */
export const sidebarStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `nextInvoice` em sprint futura. */
export const nextInvoiceStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `alerts` em sprint futura. */
export const alertStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `capabilities` em sprint futura. */
export const capabilityStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `technical` em sprint futura. */
export const technicalStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Ordem canônica do pipeline (constituição 4.2R §4). */
export const BILLING_AGGREGATE_PIPELINE_STAGES: readonly BillingAggregateStage[] = [
  subscriptionStage,
  cycleStage,
  timelineStage,
  financialEventStage,
  historyStage,
  calendarStage,
  sidebarStage,
  nextInvoiceStage,
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
  'SidebarStage',
  'NextInvoiceStage',
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
