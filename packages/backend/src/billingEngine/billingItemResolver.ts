/**
 * Billing Engine V2 — Sprint 3.0: resolve itens (delega Projection).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { resolveProjectionItems } from '../billingProjection/projectionItemResolver.js';

export { type ProjectionItemDraft as BillingItemDraft } from '../billingProjection/projectionItemResolver.js';

export function resolveBillingItemsForEngine(context: BillingExecutionContext) {
  return resolveProjectionItems(context);
}
