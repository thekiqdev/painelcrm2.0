import type {
  BillingFinancialEventSnapshot,
  BillingSidebarSnapshot,
  BillingSubscriptionSnapshot,
} from './types';

/**
 * Seleciona o evento mais recente por `occurredAt` (desempate por `id`).
 * Cópia determinística — sem regras de negócio.
 */
function resolveLastEvent(
  events: BillingFinancialEventSnapshot[]
): BillingFinancialEventSnapshot | null {
  if (events.length === 0) return null;
  let last = events[0]!;
  for (let i = 1; i < events.length; i++) {
    const candidate = events[i]!;
    const byDate = candidate.occurredAt.localeCompare(last.occurredAt);
    if (byDate > 0 || (byDate === 0 && candidate.id.localeCompare(last.id) > 0)) {
      last = candidate;
    }
  }
  return last;
}

/**
 * Projeta `aggregate.sidebar` a partir de subscription + events.
 * Sprint 5.0-17: resumo determinístico — sem alerts, NextInvoice, capabilities ou projeções.
 */
export function buildSidebarFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  events: BillingFinancialEventSnapshot[]
): BillingSidebarSnapshot {
  const lastEvent = resolveLastEvent(events);
  return {
    subscriptionStatus: subscription.status,
    subscriptionType: subscription.subscriptionType,
    billingInterval: subscription.billingInterval,
    currency: subscription.currency,
    amount: subscription.amount,
    eventCount: events.length,
    lastEventDate: lastEvent?.occurredAt ?? null,
    lastEventType: lastEvent?.eventType ?? null,
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
