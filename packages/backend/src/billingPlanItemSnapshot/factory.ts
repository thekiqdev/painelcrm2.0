/**
 * Billing Engine V2 — fotografia lógica do Billing Item (sem gravar).
 */
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import { BillingItemDefinitionHasher } from '../billingPlanItems/definitionHasher.js';
import type { BillingItemSnapshot } from './types.js';

export function buildBillingItemSnapshot(
  item: BillingPlanItemRow,
  capturedAt: string = new Date().toISOString()
): BillingItemSnapshot {
  return {
    sourceItemId: item.id,
    billingPlanId: item.billing_plan_id,
    sequence: item.sequence,
    itemRevision: item.item_revision,
    definitionHash: item.definition_hash || BillingItemDefinitionHasher.hashFromRow(item),
    snapshotStrategy: item.snapshot_strategy,
    capturedAt,
    effectiveFrom: item.effective_from,
    effectiveUntil: item.effective_until,
    definition: {
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_type: item.discount_type,
      discount_value: item.discount_value,
      tax_rate: item.tax_rate,
      tax_value: item.tax_value,
      total_amount: item.total_amount,
      currency: item.currency,
      is_recurring: item.is_recurring,
      billing_interval: item.billing_interval,
      billing_frequency: item.billing_frequency,
      billing_anchor: item.billing_anchor,
      proration_mode: item.proration_mode,
      trial_until: item.trial_until,
      metadata: item.metadata,
    },
  };
}
