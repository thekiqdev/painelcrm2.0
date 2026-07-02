/**
 * Billing Engine V2 — Sprint 2.3D: cálculo de preços (puro).
 */
import type { ProjectionItemDraft } from './projectionItemResolver.js';

export type PricedProjectionItem = ProjectionItemDraft & {
  unitPrice: number;
  quantity: number;
  lineSubtotal: number;
};

export function calculateProjectionPrices(items: ProjectionItemDraft[]): PricedProjectionItem[] {
  return items.map((item) => {
    const unitPrice = item.resolved.resolvedPrice;
    const quantity = item.resolved.resolvedQuantity;
    const lineSubtotal = Math.round(unitPrice * quantity);
    return { ...item, unitPrice, quantity, lineSubtotal };
  });
}
