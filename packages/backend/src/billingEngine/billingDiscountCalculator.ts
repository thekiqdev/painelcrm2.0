/**
 * Billing Engine V2 — Sprint 3.0: descontos (delega Projection).
 */
import { calculateProjectionDiscounts } from '../billingProjection/projectionDiscountCalculator.js';
import type { PricedProjectionItem } from '../billingProjection/projectionPriceCalculator.js';

export function calculateBillingDiscounts(priced: PricedProjectionItem[]) {
  return calculateProjectionDiscounts(priced);
}
