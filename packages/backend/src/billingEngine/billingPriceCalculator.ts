/**
 * Billing Engine V2 — Sprint 3.0: preços (delega Projection).
 */
import { calculateProjectionPrices } from '../billingProjection/projectionPriceCalculator.js';
import type { ProjectionItemDraft } from '../billingProjection/projectionItemResolver.js';

export function calculateBillingPrices(itemDrafts: ProjectionItemDraft[]) {
  return calculateProjectionPrices(itemDrafts);
}
