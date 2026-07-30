import { invoiceVisibilityFromCycle } from '@/lib/resolvedCompetencyPresentation';
import type {
  BillingAlertSnapshot,
  BillingCalendarSnapshot,
  BillingCapabilitySnapshot,
  BillingCycleSnapshot,
  BillingFinancialEventSnapshot,
  BillingHistorySnapshot,
  BillingNextInvoiceSnapshot,
  BillingSidebarSnapshot,
  BillingSubscriptionSnapshot,
} from './types';

export type CapabilitiesAggregateInput = {
  subscription: BillingSubscriptionSnapshot;
  cycles: BillingCycleSnapshot[];
  events: BillingFinancialEventSnapshot[];
  history: BillingHistorySnapshot[];
  calendar: BillingCalendarSnapshot[];
  sidebar: BillingSidebarSnapshot;
  nextInvoice: BillingNextInvoiceSnapshot | null;
  alerts: BillingAlertSnapshot[];
};

export function cycleSupportsManualGenerateFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[],
  cycleId: string | null | undefined
): boolean {
  if (!cycleId?.trim()) return false;
  const cycle = cycles.find((c) => c.id === cycleId.trim());
  if (!cycle) return false;
  const allowNewCharge = aggregateSubscriptionAllowsNewCharge(subscription, cycles);
  return invoiceVisibilityFromCycle(cycle.invoiceId, subscription.status, { allowNewCharge })
    .canGenerate;
}

function aggregateSubscriptionAllowsNewCharge(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[]
): boolean {
  if (subscription.status === 'cancelled' || subscription.status === 'completed') return false;
  if (subscription.cyclesUnlimited !== false) return true;
  const max = subscription.maxCycles;
  if (max == null || max < 1) return true;
  const emitted = cycles.filter((c) => Boolean(c.invoiceId?.trim())).length;
  return emitted < Math.trunc(max);
}

/**
 * Capabilities alinhadas ao OCRE.
 */
export function buildCapabilitiesFromAggregate(
  input: CapabilitiesAggregateInput
): BillingCapabilitySnapshot {
  const { subscription, cycles, events, history, calendar, nextInvoice, alerts } = input;
  const status = subscription.status;
  const real = events.filter((e) => e.kind === 'real');

  const failedEventCount = real.filter((e) => e.eventType === 'invoice_failed').length;
  const paymentEventCount = real.filter((e) => e.eventType === 'payment').length;
  const eventsWithInvoiceCount = real.filter((e) => Boolean(e.metadata.invoiceId)).length;

  const allowNewCharge = aggregateSubscriptionAllowsNewCharge(subscription, cycles);
  const canGenerate =
    allowNewCharge &&
    status !== 'cancelled' &&
    status !== 'completed' &&
    cycles.some((c) =>
      invoiceVisibilityFromCycle(c.invoiceId, status, { allowNewCharge }).canGenerate
    );

  const hasInvoice =
    eventsWithInvoiceCount > 0 || Boolean(nextInvoice?.metadata.invoiceId);

  return {
    canGenerate,
    canRetry: status !== 'cancelled' && failedEventCount > 0,
    canCancel: status === 'active' && real.length > 0,
    canRefund: paymentEventCount > 0,
    canPause: status === 'active',
    canResume: status === 'paused',
    canReactivate: status === 'cancelled' || status === 'expired',
    canDeleteInvoice: eventsWithInvoiceCount > 0,
    canOpenInvoice: hasInvoice,
    canOpenSubscription: Boolean(subscription.id),
    metadata: {
      subscriptionId: subscription.id,
      subscriptionStatus: status,
      cycleCount: cycles.length,
      eventCount: real.length,
      historyCount: history.length,
      calendarCount: calendar.length,
      alertCount: alerts.length,
      hasNextInvoice: nextInvoice !== null,
      failedEventCount,
      paymentEventCount,
      eventsWithInvoiceCount,
    },
  };
}
