import type { BillingAggregate, BillingAggregateStage, BillingContext } from './types';

/** Sprint 5.0-11 — placeholder; popula `subscription` em sprint futura. */
export const subscriptionStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `cycles` em sprint futura. */
export const cycleStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `timeline` em sprint futura. */
export const timelineStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `events` em sprint futura. */
export const financialEventStage: BillingAggregateStage = (_context, aggregate) => aggregate;

/** Sprint 5.0-11 — placeholder; popula `history` em sprint futura. */
export const historyStage: BillingAggregateStage = (_context, aggregate) => aggregate;

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
