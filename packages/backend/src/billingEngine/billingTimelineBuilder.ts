/**
 * Billing Engine V2 — Sprint 3.0: timeline (delega Projection).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { resolveProjectionTimeline } from '../billingProjection/projectionTimelineResolver.js';

export function buildBillingTimelineEvents(context: BillingExecutionContext, grandTotal: number) {
  return resolveProjectionTimeline(context, grandTotal);
}
