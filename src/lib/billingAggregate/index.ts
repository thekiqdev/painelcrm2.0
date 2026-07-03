export type {
  BillingAggregate,
  BillingAlertKind,
  BillingAlertMetadata,
  BillingAlertSeverity,
  BillingAlertSnapshot,
  BillingCalendarEntryMetadata,
  BillingCalendarSnapshot,
  BillingCapabilitiesMetadata,
  BillingCapabilitySnapshot,
  BillingContext,
  BillingContextSourceRefs,
  BillingContextValidationResult,
  BillingCycleMetadata,
  BillingCycleSnapshot,
  BillingFinancialEventMetadata,
  BillingFinancialEventSnapshot,
  BillingFinancialEventType,
  BillingHistoryRowMetadata,
  BillingHistorySnapshot,
  BillingInvoiceSnapshot,
  BillingNextInvoiceMetadata,
  BillingNextInvoiceSnapshot,
  BillingSidebarMetadata,
  BillingSidebarSnapshot,
  BillingSubscriptionMetadata,
  BillingSubscriptionSnapshot,
  BillingTechnicalSnapshot,
  BillingAggregateStage,
} from './types';

export { extractBillingContextSourceRefs } from './types';

export {
  createEmptyBillingAggregate,
  billingAggregateSignature,
} from './BillingAggregate';

export {
  billingContextSourceSignature,
  createBillingContext,
  validateBillingContext,
  assertValidBillingContext,
  snapshotBillingContextSource,
} from './BillingContext';

export {
  buildBillingAggregate,
  buildBillingAggregateFromDetail,
} from './BillingAggregateFactory';

export {
  mapSubscriptionSnapshot,
  EMPTY_BILLING_SUBSCRIPTION_SNAPSHOT,
} from './subscriptionSnapshot';

export { mapCycleSnapshot, mapCyclesFromSource } from './cycleSnapshot';
export type { BillingCycleRawSource } from './cycleSnapshot';

export {
  mapCycleToFinancialEvent,
  buildFinancialEventsFromAggregate,
} from './financialEventSnapshot';

export { mapEventToHistoryRow, buildHistoryFromEvents } from './historySnapshot';

export { mapEventToCalendarEntry, buildCalendarFromEvents } from './calendarSnapshot';

export { buildSidebarFromAggregate } from './sidebarSnapshot';

export { resolveNextInvoiceFromEvents } from './nextInvoiceSnapshot';

export { buildAlertsFromAggregate } from './alertsSnapshot';

export { buildCapabilitiesFromAggregate } from './capabilitiesSnapshot';
export type { CapabilitiesAggregateInput } from './capabilitiesSnapshot';

export {
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
  BILLING_AGGREGATE_PIPELINE_STAGES,
  BILLING_AGGREGATE_PIPELINE_STAGE_NAMES,
  runBillingAggregatePipeline,
} from './BillingAggregateBuilder';
