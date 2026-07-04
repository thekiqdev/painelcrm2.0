import { advanceBillingDueYmd } from './aggregateDateUtils';
import type {
  BillingCycleSnapshot,
  BillingFinancialEventSnapshot,
  BillingSubscriptionSnapshot,
} from './types';

export const PROJECTION_MAX_COUNT = 12;

/**
 * Projeções UX a partir de nextBillingDate, excluindo datas ocupadas por cycles.
 * Sem cycleId — nunca participam de Generate.
 */
export function buildProjectionEventsFromAggregate(
  subscription: BillingSubscriptionSnapshot,
  cycles: BillingCycleSnapshot[],
  count = PROJECTION_MAX_COUNT
): BillingFinancialEventSnapshot[] {
  if (subscription.status === 'cancelled') return [];
  let due = subscription.nextBillingDate;
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return [];

  const occupied = new Set(
    cycles.map((c) => c.cycleDate).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  );

  const events: BillingFinancialEventSnapshot[] = [];
  const seen = new Set<string>();
  let guard = 0;

  while (events.length < count && guard < count + occupied.size + 2) {
    guard += 1;
    if (!occupied.has(due) && !seen.has(due)) {
      seen.add(due);
      events.push({
        id: `projected-${due}`,
        cycleId: null,
        subscriptionId: subscription.id,
        eventType: 'upcoming_cycle',
        dueYmd: due,
        occurredAt: due,
        status: subscription.status === 'paused' ? 'paused' : 'projected',
        kind: 'projected',
        metadata: {
          invoiceId: null,
          jobId: null,
          periodStart: due,
          periodEnd: advanceBillingDueYmd(due, subscription.billingInterval),
          skippedReason: null,
          errorMessage: null,
          amount: subscription.amount,
          currency: subscription.currency,
          cycleMetadata: {},
        },
      });
    }
    due = advanceBillingDueYmd(due, subscription.billingInterval);
  }

  return events;
}
