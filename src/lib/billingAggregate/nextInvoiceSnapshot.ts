import { GENERATABLE_CYCLE_STATUSES } from './aggregateDateUtils';
import type {
  BillingCycleSnapshot,
  BillingFinancialEventSnapshot,
  BillingNextInvoiceSnapshot,
  BillingSubscriptionSnapshot,
} from './types';

/** Primeiro ciclo elegível (invoiceId null, status generatable) — paridade resolveFirstEligibleCycle. */
export function resolveFirstEligibleCycleFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[]
): BillingCycleSnapshot | null {
  if (subscription.status === 'cancelled') return null;
  const ordered = [...cycles].sort(
    (a, b) => a.cycleDate.localeCompare(b.cycleDate) || a.id.localeCompare(b.id)
  );
  for (const cycle of ordered) {
    if (cycle.invoiceId) continue;
    if (!GENERATABLE_CYCLE_STATUSES.has(cycle.status.trim().toLowerCase())) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cycle.cycleDate)) continue;
    return cycle;
  }
  return null;
}

function firstProjectedEvent(
  events: BillingFinancialEventSnapshot[],
  todayYmd: string
): BillingFinancialEventSnapshot | null {
  return (
    events
      .filter((e) => e.kind === 'projected' && e.dueYmd >= todayYmd)
      .sort((a, b) => a.dueYmd.localeCompare(b.dueYmd) || a.id.localeCompare(b.id))[0] ?? null
  );
}

/**
 * NextInvoice = evento do first eligible cycle, senão primeira projeção futura.
 * Alinhado a resolveNextChargePresentation (sem timeline).
 */
export function resolveNextInvoiceFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[],
  events: BillingFinancialEventSnapshot[],
  todayYmd: string
): BillingNextInvoiceSnapshot | null {
  const first = resolveFirstEligibleCycleFromAggregate(subscription, cycles);
  if (first) {
    const event = events.find((e) => e.kind === 'real' && e.cycleId === first.id) ?? null;
    return {
      eventId: event?.id ?? null,
      cycleId: first.id,
      subscriptionId: subscription.id,
      eventType: event?.eventType ?? 'cycle_pending',
      date: first.cycleDate,
      status: first.status,
      isProjected: false,
      metadata: {
        invoiceId: first.invoiceId,
        jobId: first.jobId,
        periodStart: first.periodStart,
        periodEnd: first.periodEnd,
        skippedReason: first.skippedReason,
        errorMessage: first.errorMessage,
        amount: subscription.amount,
        currency: subscription.currency,
      },
    };
  }

  const projected = firstProjectedEvent(events, todayYmd);
  if (!projected) return null;

  return {
    eventId: projected.id,
    cycleId: null,
    subscriptionId: subscription.id,
    eventType: projected.eventType,
    date: projected.dueYmd,
    status: projected.status,
    isProjected: true,
    metadata: {
      invoiceId: null,
      jobId: null,
      periodStart: projected.metadata.periodStart,
      periodEnd: projected.metadata.periodEnd,
      skippedReason: null,
      errorMessage: null,
      amount: subscription.amount,
      currency: subscription.currency,
    },
  };
}

/** @deprecated use resolveNextInvoiceFromAggregate */
export function resolveNextInvoiceFromEvents(
  events: BillingFinancialEventSnapshot[]
): BillingNextInvoiceSnapshot | null {
  const real = events.filter((e) => e.kind === 'real' && e.cycleId);
  if (real.length === 0) return null;
  const event = [...real].sort(
    (a, b) => a.dueYmd.localeCompare(b.dueYmd) || (a.cycleId ?? '').localeCompare(b.cycleId ?? '')
  )[0]!;
  return {
    eventId: event.id,
    cycleId: event.cycleId,
    subscriptionId: event.subscriptionId,
    eventType: event.eventType,
    date: event.dueYmd,
    status: event.status,
    isProjected: false,
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
