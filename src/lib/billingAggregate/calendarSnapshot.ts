import type { BillingCalendarSnapshot, BillingFinancialEventSnapshot } from './types';

/**
 * Converte um FinancialEvent do Aggregate em CalendarEntry (1:1).
 * Sprint 5.0-16: sem cycles, timeline, projeções, Generate ou capabilities.
 */
export function mapEventToCalendarEntry(
  event: BillingFinancialEventSnapshot
): BillingCalendarSnapshot {
  return {
    id: `calendar-${event.id}`,
    eventId: event.id,
    cycleId: event.cycleId,
    subscriptionId: event.subscriptionId,
    date: event.occurredAt,
    eventType: event.eventType,
    status: event.status,
    metadata: {
      invoiceId: event.metadata.invoiceId,
      jobId: event.metadata.jobId,
      periodStart: event.metadata.periodStart,
      periodEnd: event.metadata.periodEnd,
      skippedReason: event.metadata.skippedReason,
      errorMessage: event.metadata.errorMessage,
      amount: event.metadata.amount,
      currency: event.metadata.currency,
    },
  };
}

/**
 * Projeta `aggregate.calendar` exclusivamente a partir de `aggregate.events`.
 * Ordenação cronológica por `occurredAt` (asc), desempate por `id` —
 * mesma ordenação que History (projeções paralelas da mesma coleção).
 * Uma entrada por evento — sem projeção, consolidação ou Generate.
 */
export function buildCalendarFromEvents(
  events: BillingFinancialEventSnapshot[]
): BillingCalendarSnapshot[] {
  const sorted = [...events].sort((a, b) => {
    const byDate = a.occurredAt.localeCompare(b.occurredAt);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
  return sorted.map(mapEventToCalendarEntry);
}
