import type {
  BillingAlertSnapshot,
  BillingCycleSnapshot,
  BillingFinancialEventSnapshot,
  BillingInvoiceSnapshot,
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

function isInvoicePaidStatus(status: string): boolean {
  return status.trim().toLowerCase() === 'paid';
}

function isInvoiceRefundedStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === 'refunded' || s === 'chargeback';
}

function isGatewayChargeFailed(inv: BillingInvoiceSnapshot): boolean {
  const gs = (inv.gateway_status ?? '').trim().toLowerCase();
  if (gs === 'failed' || gs === 'refused' || gs === 'chargeback') return true;
  const st = inv.status.trim().toLowerCase();
  if (st === 'gateway_failed' || st === 'failed') return true;
  if (inv.gateway_reference_id?.trim()) return false;
  return false;
}

function isOverdueInvoice(inv: BillingInvoiceSnapshot, todayYmd: string): boolean {
  if (isInvoicePaidStatus(inv.status) || isInvoiceRefundedStatus(inv.status)) return false;
  return inv.due_date < todayYmd;
}

/**
 * Alertas alinhados à taxonomia legada — events + invoices + cycles (sem timeline).
 * Lifecycle alerts: omitidos intencionalmente (decisão 4.2R — Sprint 5.0-21D).
 */
export function buildAlertsFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  events: BillingFinancialEventSnapshot[],
  nextInvoice: BillingNextInvoiceSnapshot | null,
  cycles: BillingCycleSnapshot[],
  invoices: BillingInvoiceSnapshot[],
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

  // client_overdue: fatura em aberto com due < today OU ciclo pending retroativo (RC-4b)
  const overdueEvent = real
    .filter(
      (e) =>
        e.eventType === 'invoice_due' &&
        e.dueYmd < todayYmd &&
        !isInvoicePaidStatus(e.status) &&
        !isInvoiceRefundedStatus(e.status)
    )
    .sort((a, b) => a.dueYmd.localeCompare(b.dueYmd))[0];

  const overdueCycle = cycles.find(
    (c) =>
      !c.invoiceId &&
      c.cycleDate < todayYmd &&
      ['pending', 'queued'].includes(c.status.toLowerCase())
  );

  const overdueInvoice = invoices
    .filter((inv) => isOverdueInvoice(inv, todayYmd))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  if (overdueEvent || overdueCycle || overdueInvoice) {
    const dueYmd =
      overdueEvent?.dueYmd ??
      overdueCycle?.cycleDate ??
      overdueInvoice?.due_date ??
      todayYmd;
    const days = Math.floor(
      (new Date(`${todayYmd}T12:00:00Z`).getTime() -
        new Date(`${dueYmd}T12:00:00Z`).getTime()) /
        86400000
    );
    alerts.push({
      id: 'client-overdue',
      kind: 'client_overdue',
      severity: 'warning',
      title: 'Cliente atrasado',
      description: `${days} dia(s).`,
      eventId: overdueEvent?.id ?? null,
      metadata: baseMetadata(subscription, {
        eventType: overdueEvent?.eventType ?? null,
        eventStatus: overdueEvent?.status ?? overdueCycle?.status ?? overdueInvoice?.status ?? null,
      }),
    });
  }

  // gateway_failed: exclusivamente via invoice.status / gateway_status (RC-3)
  const gwInvoice = invoices.find(isGatewayChargeFailed);
  const gwEvent = real.find(
    (e) => e.status.toLowerCase() === 'gateway_failed' && e.metadata.invoiceId
  );
  if (gwInvoice || gwEvent) {
    alerts.push({
      id: 'gateway-failed',
      kind: 'gateway_failed',
      severity: 'error',
      title: 'Gateway recusou cobrança',
      description: 'Verifique o meio de pagamento do cliente.',
      eventId: gwEvent?.id ?? null,
      metadata: baseMetadata(subscription, {
        eventType: gwEvent?.eventType ?? null,
        eventStatus: gwInvoice?.status ?? gwEvent?.status ?? null,
      }),
    });
  }

  void nextInvoice;

  return alerts.sort((a, b) => a.id.localeCompare(b.id));
}
