import type { BillingFinancialEventSnapshot, BillingNextInvoiceSnapshot } from './types';

/**
 * Seleciona o FinancialEvent mais antigo por `occurredAt` (desempate por `id`).
 * Critério determinístico — sem elegibilidade, projeção ou recálculo de datas.
 */
function resolveEarliestEvent(
  events: BillingFinancialEventSnapshot[]
): BillingFinancialEventSnapshot | null {
  if (events.length === 0) return null;
  let earliest = events[0]!;
  for (let i = 1; i < events.length; i++) {
    const candidate = events[i]!;
    const byDate = candidate.occurredAt.localeCompare(earliest.occurredAt);
    if (byDate < 0 || (byDate === 0 && candidate.id.localeCompare(earliest.id) < 0)) {
      earliest = candidate;
    }
  }
  return earliest;
}

/**
 * Resolve `aggregate.nextInvoice` exclusivamente a partir de `aggregate.events`.
 * Sprint 5.0-18: referência a um evento existente — sem cycles, subscription ou motor legado.
 * Retorna `null` quando não há eventos (nunca cria eventos virtuais).
 */
export function resolveNextInvoiceFromEvents(
  events: BillingFinancialEventSnapshot[]
): BillingNextInvoiceSnapshot | null {
  const event = resolveEarliestEvent(events);
  if (!event) return null;
  return {
    eventId: event.id,
    cycleId: event.cycleId,
    subscriptionId: event.subscriptionId,
    eventType: event.eventType,
    date: event.occurredAt,
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
