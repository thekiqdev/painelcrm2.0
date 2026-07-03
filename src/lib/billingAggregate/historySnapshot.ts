import type {
  BillingFinancialEventSnapshot,
  BillingFinancialEventType,
  BillingHistorySnapshot,
} from './types';

/** Títulos estáticos por eventType — sem regras de negócio. */
const EVENT_TYPE_TITLE: Record<BillingFinancialEventType, string> = {
  cycle_pending: 'Ciclo pendente',
  cycle_queued: 'Ciclo na fila',
  cycle_processing: 'Ciclo em processamento',
  invoice_generated: 'Fatura gerada',
  payment: 'Pagamento',
  invoice_failed: 'Falha na fatura',
  cycle_cancelled: 'Ciclo cancelado',
  cycle_skipped: 'Ciclo ignorado',
  cycle_unknown: 'Evento de ciclo',
};

function titleForEventType(eventType: BillingFinancialEventType): string {
  return EVENT_TYPE_TITLE[eventType] ?? EVENT_TYPE_TITLE.cycle_unknown;
}

/**
 * Converte um FinancialEvent do Aggregate em HistoryRow (1:1).
 * Sprint 5.0-15: sem cycles, timeline, elegibilidade ou Generate.
 */
export function mapEventToHistoryRow(event: BillingFinancialEventSnapshot): BillingHistorySnapshot {
  return {
    id: `history-${event.id}`,
    eventId: event.id,
    cycleId: event.cycleId,
    subscriptionId: event.subscriptionId,
    type: event.eventType,
    status: event.status,
    date: event.occurredAt,
    title: titleForEventType(event.eventType),
    metadata: {
      invoiceId: event.metadata.invoiceId,
      jobId: event.metadata.jobId,
      periodStart: event.metadata.periodStart,
      periodEnd: event.metadata.periodEnd,
      skippedReason: event.metadata.skippedReason,
      errorMessage: event.metadata.errorMessage,
      amount: event.metadata.amount,
      currency: event.metadata.currency,
      eventType: event.eventType,
    },
  };
}

/**
 * Projeta `aggregate.history` exclusivamente a partir de `aggregate.events`.
 * Ordenação cronológica por `occurredAt` (asc), desempate por `id`.
 * Uma linha por evento — sem consolidação nem deduplicação.
 */
export function buildHistoryFromEvents(
  events: BillingFinancialEventSnapshot[]
): BillingHistorySnapshot[] {
  const sorted = [...events].sort((a, b) => {
    const byDate = a.occurredAt.localeCompare(b.occurredAt);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
  return sorted.map(mapEventToHistoryRow);
}
