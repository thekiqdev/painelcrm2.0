import { formatCentsCompact, formatEventDateShort } from './aggregateDateUtils';
import type {
  BillingFinancialEventSnapshot,
  BillingNextInvoiceSnapshot,
  BillingSidebarSnapshot,
  BillingSubscriptionSnapshot,
} from './types';

function ymdHead(value: string | null | undefined): string | null {
  if (!value) return null;
  const head = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

const OPEN_EVENT_TYPES = new Set([
  'invoice_due',
  'invoice_generated',
  'manual_charge',
]);

/**
 * Sidebar alinhada ao contrato UI legado (nextReceiptDate, openAmount, lastPaymentDate).
 */
export function buildSidebarFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  events: BillingFinancialEventSnapshot[],
  nextInvoice: BillingNextInvoiceSnapshot | null
): BillingSidebarSnapshot {
  const real = events.filter((e) => e.kind === 'real');
  const payments = real.filter((e) => e.eventType === 'payment');
  const lastPayment = [...payments].sort((a, b) => b.dueYmd.localeCompare(a.dueYmd))[0];
  const openCents = real
    .filter((e) => OPEN_EVENT_TYPES.has(e.eventType))
    .reduce((s, e) => s + (e.metadata.amount ?? 0), 0);

  const lastReal = [...real].sort(
    (a, b) => b.dueYmd.localeCompare(a.dueYmd) || b.id.localeCompare(a.id)
  )[0];

  const nextDate = nextInvoice?.date ?? null;

  return {
    nextReceiptDate: nextDate ? formatEventDateShort(nextDate) : '—',
    openAmount: formatCentsCompact(openCents),
    lastPaymentDate: lastPayment
      ? formatEventDateShort(ymdHead(lastPayment.occurredAt) ?? lastPayment.dueYmd)
      : '—',
    subscriptionStatus: subscription.status,
    subscriptionType: subscription.subscriptionType,
    billingInterval: subscription.billingInterval,
    currency: subscription.currency,
    amount: subscription.amount,
    eventCount: real.length,
    lastEventDate: lastReal?.dueYmd ?? null,
    lastEventType: lastReal?.eventType ?? null,
    metadata: {
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      customerId: subscription.customerId,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      nextBillingDate: subscription.nextBillingDate,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
    },
  };
}
