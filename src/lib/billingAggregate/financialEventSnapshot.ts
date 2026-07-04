import { GENERATABLE_CYCLE_STATUSES } from './aggregateDateUtils';
import type {
  BillingCycleSnapshot,
  BillingFinancialEventMetadata,
  BillingFinancialEventSnapshot,
  BillingFinancialEventType,
  BillingSubscriptionSnapshot,
} from './types';

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

/**
 * Emite no máximo um evento real por ciclo, alinhado ao critério do legado
 * (subscription_cycles + status), sem timeline.
 */
export function mapCycleToFinancialEvent(
  cycle: BillingCycleSnapshot,
  subscription: BillingSubscriptionSnapshot,
  todayYmd: string
): BillingFinancialEventSnapshot | null {
  const status = cycle.status.trim().toLowerCase();
  const due = cycle.cycleDate;
  const hasInvoice = Boolean(cycle.invoiceId);
  const meta = buildEventMetadata(cycle, subscription);
  const base = {
    cycleId: cycle.id,
    subscriptionId: cycle.subscriptionId,
    dueYmd: due,
    occurredAt: cycle.processedAt ?? due,
    status: cycle.status,
    kind: 'real' as const,
    metadata: meta,
  };

  if (status === 'paid') {
    return { id: `billing-event-${cycle.id}`, eventType: 'payment', ...base };
  }

  if (subscription.status === 'cancelled') {
    return null;
  }

  if (status === 'failed' && !hasInvoice) {
    const recoverable = !due || due >= todayYmd;
    return {
      id: `billing-event-${cycle.id}`,
      eventType: recoverable ? 'cycle_pending' : 'invoice_failed',
      ...base,
    };
  }

  if (hasInvoice && (status === 'generated' || status === 'invoiced' || status === 'pending')) {
    return { id: `billing-event-${cycle.id}`, eventType: 'invoice_due', ...base };
  }

  if (hasInvoice && status === 'gateway_failed') {
    return { id: `billing-event-${cycle.id}`, eventType: 'invoice_failed', ...base };
  }

  if (!hasInvoice && GENERATABLE_CYCLE_STATUSES.has(status)) {
    const eventType: BillingFinancialEventType =
      status === 'skipped'
        ? 'cycle_skipped'
        : status === 'cancelled'
          ? 'cycle_cancelled'
          : status === 'queued'
            ? 'cycle_queued'
            : 'cycle_pending';
    return { id: `billing-event-${cycle.id}`, eventType, ...base };
  }

  if (status === 'processing') {
    return { id: `billing-event-${cycle.id}`, eventType: 'cycle_processing', ...base };
  }

  if (hasInvoice) {
    return { id: `billing-event-${cycle.id}`, eventType: 'invoice_generated', ...base };
  }

  return { id: `billing-event-${cycle.id}`, eventType: 'cycle_unknown', ...base };
}

/**
 * Constrói `aggregate.events` reais a partir de subscription + cycles + today.
 * Sprint 5.0-21B: alinhamento semântico ao legado sem builders legados.
 */
export function buildFinancialEventsFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[],
  todayYmd: string
): BillingFinancialEventSnapshot[] {
  const events: BillingFinancialEventSnapshot[] = [];
  const ordered = [...cycles].sort(
    (a, b) => a.cycleDate.localeCompare(b.cycleDate) || a.id.localeCompare(b.id)
  );
  for (const cycle of ordered) {
    const ev = mapCycleToFinancialEvent(cycle, subscription, todayYmd);
    if (ev) events.push(ev);
  }
  return events;
}
