import type { BillingCalendarSnapshot, BillingFinancialEventSnapshot } from './types';

export function mapEventToCalendarEntry(
  event: BillingFinancialEventSnapshot
): BillingCalendarSnapshot {
  return {
    id: event.kind === 'projected' ? event.id : `calendar-${event.id}`,
    eventId: event.id,
    cycleId: event.cycleId,
    subscriptionId: event.subscriptionId,
    date: event.dueYmd,
    eventType: event.eventType,
    status: event.status,
    isProjected: event.kind === 'projected',
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
 * Calendar = eventos reais + projeções.
 * Ordenação: date asc + id (paridade legado).
 */
export function buildCalendarFromEvents(
  events: BillingFinancialEventSnapshot[]
): BillingCalendarSnapshot[] {
  const sorted = [...events].sort(
    (a, b) => a.dueYmd.localeCompare(b.dueYmd) || a.id.localeCompare(b.id)
  );
  return sorted.map(mapEventToCalendarEntry);
}
