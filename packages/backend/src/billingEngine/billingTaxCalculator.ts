/**
 * Billing Engine V2 — Sprint 3.0: impostos (delega Projection).
 */
import { calculateProjectionTaxes } from '../billingProjection/projectionTaxCalculator.js';
import type { DiscountedProjectionItem } from '../billingProjection/projectionDiscountCalculator.js';

export function calculateBillingTaxes(discounted: DiscountedProjectionItem[]) {
  return calculateProjectionTaxes(discounted);
}
