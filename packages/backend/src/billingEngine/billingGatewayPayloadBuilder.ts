/**
 * Billing Engine V2 — Sprint 3.0: gateway payload (delega Projection).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { resolveProjectionGateway } from '../billingProjection/projectionGatewayResolver.js';

export function buildBillingGatewayPayload(context: BillingExecutionContext, grandTotal: number) {
  return resolveProjectionGateway(context, grandTotal);
}
