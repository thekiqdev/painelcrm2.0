import type {
  BillingCycleSnapshot,
  BillingFinancialEventMetadata,
  BillingFinancialEventSnapshot,
  BillingFinancialEventType,
  BillingSubscriptionSnapshot,
} from './types';

/** Normalização literal cycle.status → eventType (sem timeline). */
const CYCLE_STATUS_EVENT_TYPE: Record<string, BillingFinancialEventType> = {
  pending: 'cycle_pending',
  queued: 'cycle_queued',
  processing: 'cycle_processing',
  generated: 'invoice_generated',
  invoiced: 'invoice_generated',
  paid: 'payment',
  failed: 'invoice_failed',
  cancelled: 'cycle_cancelled',
  skipped: 'cycle_skipped',
};

function resolveEventType(status: string): BillingFinancialEventType {
  const key = status.trim().toLowerCase();
  return CYCLE_STATUS_EVENT_TYPE[key] ?? 'cycle_unknown';
}

function resolveOccurredAt(cycle: BillingCycleSnapshot): string {
  return cycle.processedAt ?? cycle.cycleDate;
}

function buildEventMetadata(
  cycle: BillingCycleSnapshot,
  subscription: BillingSubscriptionSnapshot
): BillingFinancialEventMetadata {
  return {
    invoiceId: cycle.invoiceId,
    jobId: cycle.jobId,
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    skippedReason: cycle.skippedReason,
    errorMessage: cycle.errorMessage,
    amount: subscription.amount,
    currency: subscription.currency,
    cycleMetadata: cycle.metadata,
  };
}

/** Um evento real por ciclo — origem exclusiva do Aggregate (5.0-14). */
export function mapCycleToFinancialEvent(
  cycle: BillingCycleSnapshot,
  subscription: BillingSubscriptionSnapshot
): BillingFinancialEventSnapshot {
  const eventType = resolveEventType(cycle.status);
  return {
    id: `billing-event-${cycle.id}`,
    cycleId: cycle.id,
    subscriptionId: cycle.subscriptionId,
    eventType,
    occurredAt: resolveOccurredAt(cycle),
    status: cycle.status,
    metadata: buildEventMetadata(cycle, subscription),
  };
}

/**
 * Constrói `aggregate.events` apenas a partir de subscription + cycles.
 * Sem projeção, sem timeline, sem builders legados.
 */
export function buildFinancialEventsFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[]
): BillingFinancialEventSnapshot[] {
  return cycles.map((cycle) => mapCycleToFinancialEvent(cycle, subscription));
}
