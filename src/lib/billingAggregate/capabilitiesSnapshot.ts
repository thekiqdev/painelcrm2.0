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

const GENERATABLE_EVENT_TYPES = new Set([
  'cycle_pending',
  'cycle_queued',
  'invoice_failed',
  'cycle_skipped',
]);

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

/**
 * Projeta `aggregate.capabilities` a partir do Aggregate completo.
 * Sprint 5.0-20: flags determinísticas — sem motor legado, sem ações, sem UI.
 */
export function buildCapabilitiesFromAggregate(
  input: CapabilitiesAggregateInput
): BillingCapabilitySnapshot {
  const { subscription, cycles, events, history, calendar, nextInvoice, alerts } = input;
  const status = subscription.status;

  const failedEventCount = events.filter((e) => e.eventType === 'invoice_failed').length;
  const paymentEventCount = events.filter((e) => e.eventType === 'payment').length;
  const eventsWithInvoiceCount = events.filter((e) => Boolean(e.metadata.invoiceId)).length;

  const hasGeneratableEvent = events.some(
    (e) => GENERATABLE_EVENT_TYPES.has(e.eventType) && !e.metadata.invoiceId
  );

  const hasInvoice =
    eventsWithInvoiceCount > 0 || Boolean(nextInvoice?.metadata.invoiceId);

  return {
    canGenerate: status === 'active' && hasGeneratableEvent,
    canRetry: status === 'active' && failedEventCount > 0,
    canCancel: status === 'active' && events.length > 0,
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
      eventCount: events.length,
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
