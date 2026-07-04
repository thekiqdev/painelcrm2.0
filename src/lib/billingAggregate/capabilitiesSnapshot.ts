import { GENERATABLE_CYCLE_STATUSES } from './aggregateDateUtils';
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
  if (subscription.status === 'cancelled') return false;
  if (!cycleId?.trim()) return false;
  const cycle = cycles.find((c) => c.id === cycleId.trim());
  if (!cycle || cycle.invoiceId) return false;
  return GENERATABLE_CYCLE_STATUSES.has(cycle.status.trim().toLowerCase());
}

/**
 * Capabilities alinhadas a cycleSupportsManualGenerate / status da assinatura.
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

  const generatableCycles = cycles.filter(
    (c) =>
      !c.invoiceId && GENERATABLE_CYCLE_STATUSES.has(c.status.trim().toLowerCase())
  );
  const canGenerate =
    status !== 'cancelled' && generatableCycles.length > 0;

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
