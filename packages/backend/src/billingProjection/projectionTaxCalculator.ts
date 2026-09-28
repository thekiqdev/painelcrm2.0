/**
 * Billing Engine V2 — Sprint 2.3D: cálculo de impostos (puro).
 */
import type { DiscountedProjectionItem } from './projectionDiscountCalculator.js';

export type TaxedProjectionItem = DiscountedProjectionItem & {
  tax: number;
  total: number;
};

export function calculateProjectionTaxes(items: DiscountedProjectionItem[]): TaxedProjectionItem[] {
  return items.map((item) => {
    const tax = item.resolved.taxes;
    const total = item.resolved.item.total_amount;
    return { ...item, tax, total };
  });
}

export function sumProjectionTaxes(items: TaxedProjectionItem[]): number {
  return items.reduce((sum, it) => sum + it.tax, 0);
}
