import { advanceBillingDueYmd } from './aggregateDateUtils';
import {
  resolveOperationalCompetencyFromContext,
  type OperationalCompetencyMode,
  type ResolvedOperationalCompetency,
} from '@/lib/operationalCompetencyResolverCore';
import type {
  BillingCycleSnapshot,
  BillingFinancialEventSnapshot,
  BillingNextInvoiceSnapshot,
  BillingSubscriptionSnapshot,
} from './types';

function aggregateContext(subscription: BillingSubscriptionSnapshot, cycles: BillingCycleSnapshot[]) {
  return {
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    billingInterval: subscription.billingInterval,
    cycles: cycles.map((c) => ({
      id: c.id,
      cycle_date: c.cycleDate,
      period_start: c.periodStart,
      period_end: c.periodEnd,
      status: c.status,
      invoice_id: c.invoiceId,
      job_id: c.jobId,
    })),
  };
}

function resolveFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[],
  mode: OperationalCompetencyMode,
  preferredCycleId?: string | null
): ResolvedOperationalCompetency {
  return resolveOperationalCompetencyFromContext(
    aggregateContext(subscription, cycles),
    { subscriptionId: subscription.id, mode, preferredCycleId },
    (fromYmd) => advanceBillingDueYmd(fromYmd, subscription.billingInterval)
  );
}

/** OCRE — primeira competência operacional no Aggregate. */
export function resolveFirstEligibleCycleFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[]
): BillingCycleSnapshot | null {
  const resolved = resolveFromAggregate(subscription, cycles, 'NEXT_GENERATE');
  if (!resolved.cycleId) return null;
  return cycles.find((c) => c.id === resolved.cycleId) ?? null;
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
 * NextInvoice via OCRE — ciclo operacional resolvido, senão projeção UX.
 */
export function resolveNextInvoiceFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[],
  events: BillingFinancialEventSnapshot[],
  todayYmd: string
): BillingNextInvoiceSnapshot | null {
  const resolved = resolveFromAggregate(subscription, cycles, 'NEXT_CARD');
  if (resolved.resolution === 'WAITING_MATERIALIZATION' && resolved.cycleDate) {
    return {
      eventId: null,
      cycleId: null,
      subscriptionId: subscription.id,
      eventType: 'cycle_pending',
      date: resolved.cycleDate,
      status: 'pending',
      isProjected: false,
      metadata: {
        invoiceId: null,
        jobId: null,
        periodStart: resolved.cycleDate,
        periodEnd: advanceBillingDueYmd(resolved.cycleDate, subscription.billingInterval),
        skippedReason: null,
        errorMessage: null,
        amount: subscription.amount,
        currency: subscription.currency,
      },
    };
  }
  const first = resolved.cycleId ? cycles.find((c) => c.id === resolved.cycleId) ?? null : null;
  const fallbackCycle =
    first ??
    [...cycles]
      .filter((c) => !c.invoiceId?.trim())
      .sort((a, b) => a.cycleDate.localeCompare(b.cycleDate) || a.id.localeCompare(b.id))
      .find((c) => c.cycleDate >= todayYmd) ??
    null;
  const chosen = fallbackCycle;
  if (chosen) {
    const event = events.find((e) => e.kind === 'real' && e.cycleId === chosen.id) ?? null;
    return {
      eventId: event?.id ?? null,
      cycleId: chosen.id,
      subscriptionId: subscription.id,
      eventType: event?.eventType ?? 'cycle_pending',
      date: chosen.cycleDate,
      status: chosen.status,
      isProjected: false,
      metadata: {
        invoiceId: chosen.invoiceId,
        jobId: chosen.jobId,
        periodStart: chosen.periodStart,
        periodEnd: chosen.periodEnd,
        skippedReason: chosen.skippedReason,
        errorMessage: chosen.errorMessage,
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

export { resolveFromAggregate as resolveOperationalCompetencyFromAggregate };
