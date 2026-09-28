/**
 * Billing Engine V2 — snapshot lógico do Billing Item (conceito; sem persistência).
 */
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';

export type BillingItemSnapshotStrategy = 'invoice_snapshot' | 'logical_snapshot' | 'future';

export type BillingItemSnapshot = {
  sourceItemId: string;
  billingPlanId: string;
  sequence: number;
  itemRevision: number;
  definitionHash: string;
  snapshotStrategy: BillingItemSnapshotStrategy;
  capturedAt: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  definition: Pick<
    BillingPlanItemRow,
    | 'name'
    | 'description'
    | 'quantity'
    | 'unit_price'
    | 'discount_type'
    | 'discount_value'
    | 'tax_rate'
    | 'tax_value'
    | 'total_amount'
    | 'currency'
    | 'is_recurring'
    | 'billing_interval'
    | 'billing_frequency'
    | 'billing_anchor'
    | 'proration_mode'
    | 'trial_until'
    | 'metadata'
  >;
};
