/**
 * Billing Engine V2 — Sprint 2.3D: resolve itens de projeção (puro, sem DB).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { ResolvedBillingItem } from '../billingExecutionContext/types.js';

export type ProjectionItemDraft = {
  resolved: ResolvedBillingItem;
  currency: string;
};

export function resolveProjectionItems(context: BillingExecutionContext): ProjectionItemDraft[] {
  const currency = context.billingPlan.currency || context.subscription.currency || 'BRL';
  return context.resolvedItems.map((resolved) => ({
    resolved,
    currency: resolved.item.currency || currency,
  }));
}
