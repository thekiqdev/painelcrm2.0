import type {
  BillingFinancialEventSnapshot,
  BillingFinancialEventType,
  BillingHistorySnapshot,
} from './types';

const EVENT_TYPE_TITLE: Record<BillingFinancialEventType, string> = {
  cycle_pending: 'Ciclo pendente',
  cycle_queued: 'Ciclo na fila',
  cycle_processing: 'Ciclo em processamento',
  invoice_generated: 'Fatura gerada',
  invoice_due: 'Fatura em aberto',
  payment: 'Pagamento',
  invoice_failed: 'Falha na fatura',
  cycle_cancelled: 'Ciclo cancelado',
  cycle_skipped: 'Ciclo ignorado',
  cycle_unknown: 'Evento de ciclo',
  upcoming_cycle: 'Prevista',
};

function titleForEventType(eventType: BillingFinancialEventType): string {
  return EVENT_TYPE_TITLE[eventType] ?? EVENT_TYPE_TITLE.cycle_unknown;
}

export function mapEventToHistoryRow(event: BillingFinancialEventSnapshot): BillingHistorySnapshot | null {
  if (event.kind === 'projected' || !event.cycleId) return null;
  return {
    id: `history-${event.id}`,
    eventId: event.id,
    cycleId: event.cycleId,
    subscriptionId: event.subscriptionId,
    type: event.eventType,
    status: event.status,
    date: event.dueYmd,
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
 * History apenas de eventos reais com cycleId.
 * Ordenação: dueYmd desc (paridade com FinancialEventStore.getHistoryRows).
 */
export function buildHistoryFromEvents(
  events: BillingFinancialEventSnapshot[]
): BillingHistorySnapshot[] {
  const rows = events
    .map(mapEventToHistoryRow)
    .filter((r): r is BillingHistorySnapshot => r != null);
  return rows.sort(
    (a, b) => b.date.localeCompare(a.date) || a.cycleId.localeCompare(b.cycleId)
  );
}
