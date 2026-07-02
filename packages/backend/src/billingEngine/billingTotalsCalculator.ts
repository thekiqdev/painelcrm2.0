/**
 * Billing Engine V2 — Sprint 3.0: totais (delega Projection).
 */
import { calculateProjectionTotals } from '../billingProjection/projectionTotalCalculator.js';
import type { TaxedProjectionItem } from '../billingProjection/projectionTaxCalculator.js';

export function calculateBillingTotals(taxed: TaxedProjectionItem[], gatewayFees: number) {
  return calculateProjectionTotals(taxed, gatewayFees);
}
