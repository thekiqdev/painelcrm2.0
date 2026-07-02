/**
 * Billing Engine V2 — Sprint 2.3D: resolve payload de gateway (puro).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { NormalizedGatewayPayload } from '../internal-tools/billing-migration/billingShadow/types.js';

export function resolveProjectionGateway(
  context: BillingExecutionContext,
  grandTotal: number
): NormalizedGatewayPayload | null {
  if (grandTotal <= 0) return null;
  return {
    payment_method: context.gateway.paymentMethod,
    currency: context.gateway.currency,
    amount: grandTotal,
    payload: {
      simulated: true,
      provider: context.gateway.provider,
      fees: context.gateway.fees,
      billing_plan_id: context.billingPlan.id,
      ...context.gateway.gatewayMetadata,
    },
  };
}
