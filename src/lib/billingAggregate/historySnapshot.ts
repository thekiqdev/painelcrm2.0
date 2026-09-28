import type {
  BillingFinancialEventSnapshot,
  BillingFinancialEventType,
  BillingHistorySnapshot,
} from './types';

/** Prioridade de tipo para dedupe de history (espelha financialEventHelpers). */
const HISTORY_EVENT_TYPES = new Set<BillingFinancialEventType>([
  'payment',
  'invoice_generated',
  'invoice_due',
  'invoice_failed',
  'manual_charge',
  'invoice_refunded',
  'upcoming_cycle',
  'cycle_skipped',
  'cycle_cancelled',
  'cycle_pending',
]);

const EVENT_TYPE_PRIORITY: Partial<Record<BillingFinancialEventType, number>> = {
  payment: 1,
  invoice_failed: 2,
  cycle_cancelled: 3,
  invoice_refunded: 4,
  invoice_due: 5,
  cycle_skipped: 7,
  invoice_generated: 8,
  manual_charge: 9,
  upcoming_cycle: 10,
  cycle_pending: 11,
};

function eventTypePriority(type: BillingFinancialEventType): number {
  return EVENT_TYPE_PRIORITY[type] ?? 99;
}

const EVENT_TYPE_TITLE: Record<BillingFinancialEventType, string> = {
  cycle_pending: 'Ciclo pendente',
  cycle_queued: 'Ciclo na fila',
  cycle_processing: 'Ciclo em processamento',
  invoice_generated: 'Fatura gerada',
  invoice_due: 'Fatura em aberto',
  manual_charge: 'Cobrança manual',
  payment: 'Pagamento',
  invoice_refunded: 'Reembolso',
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
 * History: um row por ciclo (dedupe por prioridade de tipo — paridade getHistoryRows).
 */
export function buildHistoryFromEvents(
  events: BillingFinancialEventSnapshot[]
): BillingHistorySnapshot[] {
  const byCycle = new Map<string, BillingFinancialEventSnapshot>();
  for (const event of events) {
    if (event.kind !== 'real' || !event.cycleId) continue;
    if (!HISTORY_EVENT_TYPES.has(event.eventType)) continue;
    const existing = byCycle.get(event.cycleId);
    if (!existing || eventTypePriority(event.eventType) < eventTypePriority(existing.eventType)) {
      byCycle.set(event.cycleId, event);
    }
  }
  const rows = [...byCycle.values()]
    .map(mapEventToHistoryRow)
    .filter((r): r is BillingHistorySnapshot => r != null);
  return rows.sort(
    (a, b) => b.date.localeCompare(a.date) || a.cycleId.localeCompare(b.cycleId)
  );
}
