/**
 * Billing Engine V2 — Sprint 2.3D: resolve payload de timeline (puro).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { NormalizedTimelineEvent } from '../internal-tools/billing-migration/billingShadow/types.js';

export function resolveProjectionTimeline(
  context: BillingExecutionContext,
  grandTotal: number
): NormalizedTimelineEvent[] {
  if (grandTotal <= 0) return [];
  if (context.timeline.events.length > 0) {
    return context.timeline.events.map((e) => ({ event: e.event, order: e.order }));
  }
  return [{ event: 'renewal_completed', order: 1 }];
}
