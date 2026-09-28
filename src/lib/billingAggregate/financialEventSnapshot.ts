import { GENERATABLE_CYCLE_STATUSES } from './aggregateDateUtils';
import type {
  BillingCycleSnapshot,
  BillingFinancialEventMetadata,
  BillingFinancialEventSnapshot,
  BillingFinancialEventType,
  BillingInvoiceSnapshot,
  BillingSubscriptionSnapshot,
} from './types';

function normalizeYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const head = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

function invoiceById(
  invoices: BillingInvoiceSnapshot[],
  invoiceId: string | null | undefined
): BillingInvoiceSnapshot | undefined {
  if (!invoiceId) return undefined;
  return invoices.find((i) => i.id === invoiceId);
}

function isInvoicePaid(inv: BillingInvoiceSnapshot): boolean {
  return inv.status.trim().toLowerCase() === 'paid';
}

function isInvoiceRefunded(inv: BillingInvoiceSnapshot): boolean {
  const s = inv.status.trim().toLowerCase();
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

function isManualInvoice(inv: BillingInvoiceSnapshot): boolean {
  const t = (inv.invoice_type ?? '').trim().toLowerCase();
  return t === 'manual';
}

function isRecoverableCycleFailure(
  cycle: BillingCycleSnapshot,
  todayYmd: string
): boolean {
  if (cycle.invoiceId) return false;
  const status = cycle.status.trim().toLowerCase();
  if (status !== 'failed') return false;
  const due = cycle.cycleDate;
  if (!due) return true;
  return due >= todayYmd;
}

function buildEventMetadata(
  cycle: BillingCycleSnapshot,
  subscription: BillingSubscriptionSnapshot,
  invoice: BillingInvoiceSnapshot | undefined
): BillingFinancialEventMetadata {
  return {
    invoiceId: invoice?.id ?? cycle.invoiceId,
    jobId: cycle.jobId,
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    skippedReason: cycle.skippedReason,
    errorMessage: cycle.errorMessage,
    amount: invoice?.amount_cents ?? subscription.amount,
    currency: subscription.currency,
    cycleMetadata: cycle.metadata,
  };
}

function pushEvent(
  events: BillingFinancialEventSnapshot[],
  seen: Set<string>,
  payload: BillingFinancialEventSnapshot
): void {
  if (seen.has(payload.id)) return;
  seen.add(payload.id);
  events.push(payload);
}

/**
 * Emite N eventos reais por ciclo — paridade algorítmica com legado, via invoices[] (5.0-21D).
 */
export function emitEventsForCycle(
  events: BillingFinancialEventSnapshot[],
  seen: Set<string>,
  subscription: BillingSubscriptionSnapshot,
  cycle: BillingCycleSnapshot,
  invoice: BillingInvoiceSnapshot | undefined,
  todayYmd: string
): void {
  const due = normalizeYmd(cycle.cycleDate) ?? cycle.cycleDate;
  const meta = buildEventMetadata(cycle, subscription, invoice);
  const cycleStatus = cycle.status.trim().toLowerCase();
  const base = {
    cycleId: cycle.id,
    subscriptionId: cycle.subscriptionId,
    kind: 'real' as const,
    metadata: meta,
  };

  if (invoice && isInvoicePaid(invoice)) {
    const invoiceDue = normalizeYmd(invoice.due_date) ?? due;
    pushEvent(events, seen, {
      id: `payment-${cycle.id}-${invoiceDue}`,
      eventType: 'payment',
      dueYmd: invoiceDue,
      occurredAt: invoice.paid_at ?? cycle.processedAt ?? invoiceDue,
      status: 'paid',
      ...base,
    });
    return;
  }

  if (invoice && isInvoiceRefunded(invoice)) {
    const refYmd = normalizeYmd(invoice.refunded_at) ?? due;
    pushEvent(events, seen, {
      id: `refund-${cycle.id}-${refYmd}`,
      eventType: 'invoice_refunded',
      dueYmd: refYmd ?? due,
      occurredAt: invoice.refunded_at ?? refYmd ?? due,
      status: 'refunded',
      ...base,
    });
    return;
  }

  if (invoice && isGatewayChargeFailed(invoice)) {
    const failYmd = due ?? todayYmd;
    pushEvent(events, seen, {
      id: `gwfail-${cycle.id}-${failYmd}`,
      eventType: 'invoice_failed',
      dueYmd: failYmd,
      occurredAt: invoice.created_at,
      status: 'gateway_failed',
      ...base,
    });
  }

  if (subscription.status === 'cancelled' && !invoice) {
    return;
  }

  if (!invoice && cycleStatus === 'failed') {
    if (isRecoverableCycleFailure(cycle, todayYmd)) {
      pushEvent(events, seen, {
        id: `sched-${cycle.id}-${due}`,
        eventType: 'upcoming_cycle',
        dueYmd: due,
        occurredAt: cycle.processedAt ?? due,
        status: cycle.status,
        ...base,
        metadata: { ...meta, invoiceId: null },
      });
    } else {
      pushEvent(events, seen, {
        id: `fail-${cycle.id}-${due ?? todayYmd}`,
        eventType: 'invoice_failed',
        dueYmd: due,
        occurredAt: cycle.processedAt ?? due ?? todayYmd,
        status: cycle.status,
        ...base,
        metadata: { ...meta, invoiceId: null },
      });
    }
  }

  if (invoice && isManualInvoice(invoice)) {
    const ymd = normalizeYmd(invoice.created_at) ?? due ?? todayYmd;
    pushEvent(events, seen, {
      id: `manual-${cycle.id}-${ymd}`,
      eventType: 'manual_charge',
      dueYmd: ymd,
      occurredAt: invoice.created_at,
      status: invoice.status,
      ...base,
    });
  }

  if (invoice && !isInvoicePaid(invoice) && !isInvoiceRefunded(invoice)) {
    const invYmd = normalizeYmd(invoice.created_at);
    if (invYmd && invYmd !== due) {
      pushEvent(events, seen, {
        id: `gen-${cycle.id}-${invYmd}`,
        eventType: 'invoice_generated',
        dueYmd: invYmd,
        occurredAt: invoice.created_at,
        status: invoice.status,
        ...base,
      });
    }
  }

  if (invoice && due && !isInvoicePaid(invoice) && !isInvoiceRefunded(invoice)) {
    pushEvent(events, seen, {
      id: `due-${cycle.id}-${due}`,
      eventType: 'invoice_due',
      dueYmd: due,
      occurredAt: invoice.created_at,
      status: invoice.status,
      ...base,
    });
    return;
  }

  if (!invoice && GENERATABLE_CYCLE_STATUSES.has(cycleStatus)) {
    if (cycleStatus === 'skipped') {
      pushEvent(events, seen, {
        id: `billing-event-${cycle.id}`,
        eventType: 'cycle_skipped',
        dueYmd: due,
        occurredAt: cycle.processedAt ?? due,
        status: cycle.status,
        ...base,
        metadata: { ...meta, invoiceId: null },
      });
      return;
    }
    if (cycleStatus === 'cancelled') {
      pushEvent(events, seen, {
        id: `billing-event-${cycle.id}`,
        eventType: 'cycle_cancelled',
        dueYmd: due,
        occurredAt: cycle.processedAt ?? due,
        status: cycle.status,
        ...base,
        metadata: { ...meta, invoiceId: null },
      });
      return;
    }
    const eventType: BillingFinancialEventType =
      cycleStatus === 'failed' && !isRecoverableCycleFailure(cycle, todayYmd)
        ? 'cycle_pending'
        : 'upcoming_cycle';
    pushEvent(events, seen, {
      id: eventType === 'upcoming_cycle' ? `sched-${cycle.id}-${due}` : `billing-event-${cycle.id}`,
      eventType,
      dueYmd: due,
      occurredAt: cycle.processedAt ?? due,
      status: cycle.status,
      ...base,
      metadata: { ...meta, invoiceId: null },
    });
    return;
  }

  if (
    !invoice &&
    due &&
    cycleStatus !== 'failed' &&
    !isRecoverableCycleFailure(cycle, todayYmd) &&
    subscription.status !== 'cancelled'
  ) {
    const isFuture = due >= todayYmd;
    if (isFuture || cycleStatus === 'pending' || cycleStatus === 'skipped') {
      pushEvent(events, seen, {
        id: `sched-${cycle.id}-${due}`,
        eventType: 'upcoming_cycle',
        dueYmd: due,
        occurredAt: cycle.processedAt ?? due,
        status: cycle.status,
        ...base,
        metadata: { ...meta, invoiceId: null },
      });
    }
  }
}

/** Emite eventos para faturas órfãs (invoice_only) sem ciclo. */
function emitEventsForOrphanInvoice(
  events: BillingFinancialEventSnapshot[],
  seen: Set<string>,
  subscription: BillingSubscriptionSnapshot,
  invoice: BillingInvoiceSnapshot,
  todayYmd: string
): void {
  if (subscription.status === 'cancelled') return;
  const due = normalizeYmd(invoice.due_date) ?? invoice.due_date;
  const meta: BillingFinancialEventMetadata = {
    invoiceId: invoice.id,
    jobId: null,
    periodStart: invoice.period_start ?? '',
    periodEnd: invoice.period_end ?? '',
    skippedReason: null,
    errorMessage: null,
    amount: invoice.amount_cents,
    currency: subscription.currency,
    cycleMetadata: {},
  };
  const base = {
    cycleId: null as string | null,
    subscriptionId: subscription.id,
    kind: 'real' as const,
    metadata: meta,
  };

  if (isInvoicePaid(invoice)) {
    pushEvent(events, seen, {
      id: `payment-orphan-${invoice.id}-${due}`,
      eventType: 'payment',
      dueYmd: due,
      occurredAt: invoice.paid_at ?? due,
      status: 'paid',
      ...base,
    });
    return;
  }

  if (isManualInvoice(invoice) || !invoice.subscription_cycle_id) {
    const ymd = normalizeYmd(invoice.created_at) ?? due ?? todayYmd;
    pushEvent(events, seen, {
      id: `manual-orphan-${invoice.id}-${ymd}`,
      eventType: 'manual_charge',
      dueYmd: ymd,
      occurredAt: invoice.created_at,
      status: invoice.status,
      ...base,
    });
  }

  if (due && !isInvoicePaid(invoice) && !isInvoiceRefunded(invoice)) {
    pushEvent(events, seen, {
      id: `due-orphan-${invoice.id}-${due}`,
      eventType: 'invoice_due',
      dueYmd: due,
      occurredAt: invoice.created_at,
      status: invoice.status,
      ...base,
    });
  }
}

/**
 * @deprecated Mantido para testes de regressão do modelo 1:1.
 */
export function mapCycleToFinancialEvent(
  cycle: BillingCycleSnapshot,
  subscription: BillingSubscriptionSnapshot,
  todayYmd: string,
  invoice?: BillingInvoiceSnapshot
): BillingFinancialEventSnapshot | null {
  const events: BillingFinancialEventSnapshot[] = [];
  const seen = new Set<string>();
  emitEventsForCycle(events, seen, subscription, cycle, invoice, todayYmd);
  return events[0] ?? null;
}

/**
 * Constrói `aggregate.events` — N eventos por ciclo + órfãs via invoices[] (5.0-21D).
 */
export function buildFinancialEventsFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[],
  invoices: BillingInvoiceSnapshot[],
  todayYmd: string
): BillingFinancialEventSnapshot[] {
  const events: BillingFinancialEventSnapshot[] = [];
  const seen = new Set<string>();
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const usedInvoiceIds = new Set<string>();

  const ordered = [...cycles].sort(
    (a, b) => a.cycleDate.localeCompare(b.cycleDate) || a.id.localeCompare(b.id)
  );

  for (const cycle of ordered) {
    const invoice = cycle.invoiceId ? invById.get(cycle.invoiceId) : undefined;
    if (invoice) usedInvoiceIds.add(invoice.id);
    emitEventsForCycle(events, seen, subscription, cycle, invoice, todayYmd);
  }

  void usedInvoiceIds;

  return events.sort(
    (a, b) => a.dueYmd.localeCompare(b.dueYmd) || a.id.localeCompare(b.id)
  );
}
