/**
 * Billing Engine V2 — Sprint 2.3C: ResolvedBillingItem (cálculo único).
 */
import { BillingItemDefinitionHasher } from '../billingPlanItems/definitionHasher.js';
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import type { ResolvedBillingItem } from './types.js';

export function resolveBillingItems(items: BillingPlanItemRow[]): ResolvedBillingItem[] {
  return items
    .filter((it) => it.is_recurring && (it.status === 'active' || it.status === 'draft'))
    .sort((a, b) => a.sequence - b.sequence)
    .map((item) => ({
      item,
      effectiveRevision: item.item_revision,
      effectiveDates: {
        from: item.effective_from,
        until: item.effective_until,
      },
      resolvedPrice: item.unit_price,
      resolvedQuantity: Number(item.quantity),
      discounts: item.discount_value ?? 0,
      taxes: item.tax_value ?? 0,
      proration: item.proration_mode,
      trial: item.trial_until,
      metadata: { ...item.metadata },
      definitionHash: item.definition_hash || BillingItemDefinitionHasher.hashFromRow(item),
    }));
}
