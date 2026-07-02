/**
 * Billing Engine V2 — Sprint 3.0: notification payload (delega Projection).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { resolveProjectionNotification } from '../billingProjection/projectionNotificationResolver.js';
import type { NormalizedNotificationPayload } from '../internal-tools/billing-migration/billingShadow/types.js';

export function buildBillingNotificationPayloads(
  context: BillingExecutionContext,
  grandTotal: number
): NormalizedNotificationPayload[] {
  const payload = resolveProjectionNotification(context, grandTotal);
  return payload ? [payload] : [];
}
