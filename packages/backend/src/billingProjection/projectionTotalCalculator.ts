/**
 * Billing Engine V2 — Sprint 2.3D: totais da projeção (puro).
 */
import type { TaxedProjectionItem } from './projectionTaxCalculator.js';

export type ProjectionTotals = {
  subtotal: number;
  discounts: number;
  taxes: number;
  fees: number;
  grandTotal: number;
};

export function calculateProjectionTotals(
  items: TaxedProjectionItem[],
  fees = 0
): ProjectionTotals {
  const subtotal = items.reduce((sum, it) => sum + it.lineSubtotal, 0);
  const discounts = items.reduce((sum, it) => sum + it.discount, 0);
  const taxes = items.reduce((sum, it) => sum + it.tax, 0);
  const grandTotal = items.reduce((sum, it) => sum + it.total, 0);
  return { subtotal, discounts, taxes, fees, grandTotal };
}
