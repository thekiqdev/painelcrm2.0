/**
 * Billing Engine V2 — Sprint 3.0: history (delega Projection).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { resolveProjectionHistory } from '../billingProjection/projectionHistoryResolver.js';

export function buildBillingHistoryEvents(context: BillingExecutionContext, grandTotal: number) {
  return resolveProjectionHistory(context, grandTotal);
}
