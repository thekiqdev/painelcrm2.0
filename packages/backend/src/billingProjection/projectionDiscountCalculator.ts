/**
 * Billing Engine V2 — Sprint 2.3D: cálculo de descontos (puro).
 */
import type { PricedProjectionItem } from './projectionPriceCalculator.js';

export type DiscountedProjectionItem = PricedProjectionItem & {
  discount: number;
};

export function calculateProjectionDiscounts(
  items: PricedProjectionItem[]
): DiscountedProjectionItem[] {
  return items.map((item) => ({
    ...item,
    discount: item.resolved.discounts,
  }));
}

export function sumProjectionDiscounts(items: DiscountedProjectionItem[]): number {
  return items.reduce((sum, it) => sum + it.discount, 0);
}
