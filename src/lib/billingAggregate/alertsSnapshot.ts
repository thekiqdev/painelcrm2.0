import type {
  BillingAlertSnapshot,
  BillingCycleSnapshot,
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
 * Alertas alinhados à taxonomia legada (billing_missing, client_overdue, gateway_failed),
 * derivados de cycles/events — sem timeline.
 */
export function buildAlertsFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  events: BillingFinancialEventSnapshot[],
  nextInvoice: BillingNextInvoiceSnapshot | null,
  cycles: BillingCycleSnapshot[],
  todayYmd: string
): BillingAlertSnapshot[] {
  const alerts: BillingAlertSnapshot[] = [];
  const real = events.filter((e) => e.kind === 'real');

  // billing_missing: falha definitiva (failed sem invoice, due < today)
  const missing = real.find(
    (e) =>
      e.eventType === 'invoice_failed' &&
      !e.metadata.invoiceId &&
      e.dueYmd < todayYmd
  );
  if (missing) {
    alerts.push({
      id: 'billing-missing',
      kind: 'billing_missing',
      severity: 'error',
      title: 'Cobrança não gerada',
      description: missing.metadata.errorMessage || 'Clique para gerar novamente.',
      eventId: missing.id,
      metadata: baseMetadata(subscription, {
        eventType: missing.eventType,
        eventStatus: missing.status,
      }),
    });
  } else {
    const failedCycle = cycles.find(
      (c) =>
        c.status.toLowerCase() === 'failed' &&
        !c.invoiceId &&
        c.cycleDate < todayYmd
    );
    if (failedCycle) {
      alerts.push({
        id: 'billing-missing',
        kind: 'billing_missing',
        severity: 'error',
        title: 'Cobrança não gerada',
        description: failedCycle.errorMessage || 'Clique para gerar novamente.',
        eventId: null,
        metadata: baseMetadata(subscription, { eventStatus: failedCycle.status }),
      });
    }
  }

  // client_overdue: fatura em aberto com due < today
  const overdue = real
    .filter(
      (e) =>
        e.metadata.invoiceId &&
        e.dueYmd < todayYmd &&
        e.eventType !== 'payment' &&
        e.eventType !== 'cycle_cancelled' &&
        e.status.toLowerCase() !== 'paid' &&
        e.status.toLowerCase() !== 'refunded' &&
        e.status.toLowerCase() !== 'cancelled'
    )
    .sort((a, b) => a.dueYmd.localeCompare(b.dueYmd))[0];
  if (overdue) {
    const days = Math.floor(
      (new Date(`${todayYmd}T12:00:00Z`).getTime() -
        new Date(`${overdue.dueYmd}T12:00:00Z`).getTime()) /
        86400000
    );
    alerts.push({
      id: 'client-overdue',
      kind: 'client_overdue',
      severity: 'warning',
      title: 'Cliente atrasado',
      description: `${days} dia(s).`,
      eventId: overdue.id,
      metadata: baseMetadata(subscription, {
        eventType: overdue.eventType,
        eventStatus: overdue.status,
      }),
    });
  }

  // gateway_failed: status gateway_failed no ciclo/evento
  const gwEvent = real.find(
    (e) =>
      e.status.toLowerCase() === 'gateway_failed' ||
      (e.eventType === 'invoice_failed' && Boolean(e.metadata.invoiceId))
  );
  const gwCycle = cycles.find((c) => c.status.toLowerCase() === 'gateway_failed');
  if (gwEvent || gwCycle) {
    alerts.push({
      id: 'gateway-failed',
      kind: 'gateway_failed',
      severity: 'error',
      title: 'Gateway recusou cobrança',
      description: 'Verifique o meio de pagamento do cliente.',
      eventId: gwEvent?.id ?? null,
      metadata: baseMetadata(subscription, {
        eventType: gwEvent?.eventType ?? null,
        eventStatus: gwEvent?.status ?? gwCycle?.status ?? null,
      }),
    });
  }

  // Mantém next_invoice informativo apenas quando não há alertas legados
  // (não entra na taxonomia legada — removido para paridade de kinds)

  void nextInvoice;
  void subscription;

  return alerts.sort((a, b) => a.id.localeCompare(b.id));
}
