import type {
  BillingAlertSnapshot,
  BillingFinancialEventSnapshot,
  BillingNextInvoiceSnapshot,
  BillingSubscriptionSnapshot,
} from './types';

function baseMetadata(
  subscription: BillingSubscriptionSnapshot,
  extras: Partial<BillingAlertSnapshot['metadata']> = {}
): BillingAlertSnapshot['metadata'] {
  return {
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    eventType: null,
    eventStatus: null,
    nextInvoiceEventId: null,
    ...extras,
  };
}

/**
 * Projeta `aggregate.alerts` a partir de subscription, events e nextInvoice.
 * Sprint 5.0-19: resumo determinístico — sem ações, capabilities ou Generate.
 */
export function buildAlertsFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  events: BillingFinancialEventSnapshot[],
  nextInvoice: BillingNextInvoiceSnapshot | null
): BillingAlertSnapshot[] {
  const alerts: BillingAlertSnapshot[] = [];
  const status = subscription.status;

  if (status === 'paused') {
    alerts.push({
      id: 'alert-subscription-status-paused',
      kind: 'subscription_status',
      severity: 'warning',
      title: 'Assinatura pausada',
      description: 'Status da assinatura: paused.',
      eventId: null,
      metadata: baseMetadata(subscription),
    });
  }

  if (status === 'cancelled' || status === 'expired') {
    alerts.push({
      id: `alert-subscription-status-${status}`,
      kind: 'subscription_status',
      severity: 'warning',
      title: 'Assinatura inativa',
      description: `Status da assinatura: ${status}.`,
      eventId: null,
      metadata: baseMetadata(subscription),
    });
  }

  if (events.length === 0) {
    alerts.push({
      id: 'alert-no-events',
      kind: 'no_events',
      severity: 'info',
      title: 'Sem eventos financeiros',
      description: 'O Aggregate não possui FinancialEvents.',
      eventId: null,
      metadata: baseMetadata(subscription),
    });
  }

  for (const event of events) {
    if (event.eventType === 'invoice_failed') {
      alerts.push({
        id: `alert-invoice-failed-${event.id}`,
        kind: 'invoice_failed',
        severity: 'error',
        title: 'Falha na fatura',
        description: `Evento ${event.id} com status ${event.status}.`,
        eventId: event.id,
        metadata: baseMetadata(subscription, {
          eventType: event.eventType,
          eventStatus: event.status,
        }),
      });
    }
    if (event.eventType === 'cycle_cancelled') {
      alerts.push({
        id: `alert-cycle-cancelled-${event.id}`,
        kind: 'cycle_cancelled',
        severity: 'warning',
        title: 'Ciclo cancelado',
        description: `Evento ${event.id} com status ${event.status}.`,
        eventId: event.id,
        metadata: baseMetadata(subscription, {
          eventType: event.eventType,
          eventStatus: event.status,
        }),
      });
    }
  }

  if (nextInvoice) {
    alerts.push({
      id: `alert-next-invoice-${nextInvoice.eventId}`,
      kind: 'next_invoice',
      severity: 'info',
      title: 'Próxima cobrança identificada',
      description: `Evento ${nextInvoice.eventId} em ${nextInvoice.date}.`,
      eventId: nextInvoice.eventId,
      metadata: baseMetadata(subscription, {
        eventType: nextInvoice.eventType,
        eventStatus: nextInvoice.status,
        nextInvoiceEventId: nextInvoice.eventId,
      }),
    });
  }

  return alerts.sort((a, b) => a.id.localeCompare(b.id));
}
