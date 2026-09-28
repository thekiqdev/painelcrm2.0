/**
 * Billing Engine V2 — hash determinístico da definição estrutural do Billing Item.
 */
import { createHash } from 'node:crypto';
import type { BillingPlanItemRow } from './types.js';

export type BillingItemDefinitionPayload = {
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_type: string | null;
  discount_value: number;
  tax_rate: number | null;
  tax_value: number;
  billing_interval: string | null;
  billing_frequency: number;
  billing_anchor: number | null;
  trial_until: string | null;
  proration_mode: string | null;
  currency: string;
  metadata: Record<string, unknown>;
};

export function extractBillingItemDefinitionPayload(
  item: Pick<
    BillingPlanItemRow,
    | 'name'
    | 'description'
    | 'quantity'
    | 'unit_price'
    | 'discount_type'
    | 'discount_value'
    | 'tax_rate'
    | 'tax_value'
    | 'billing_interval'
    | 'billing_frequency'
    | 'billing_anchor'
    | 'trial_until'
    | 'proration_mode'
    | 'currency'
    | 'metadata'
  >
): BillingItemDefinitionPayload {
  return {
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_type: item.discount_type,
    discount_value: item.discount_value,
    tax_rate: item.tax_rate,
    tax_value: item.tax_value,
    billing_interval: item.billing_interval,
    billing_frequency: item.billing_frequency,
    billing_anchor: item.billing_anchor,
    trial_until: item.trial_until,
    proration_mode: item.proration_mode,
    currency: item.currency,
    metadata: item.metadata ?? {},
  };
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value;
}

export class BillingItemDefinitionHasher {
  static hash(payload: BillingItemDefinitionPayload): string {
    const canonical = canonicalize(payload);
    const json = JSON.stringify(canonical);
    return createHash('sha256').update(json, 'utf8').digest('hex');
  }

  static hashFromRow(
    item: Pick<
      BillingPlanItemRow,
      | 'name'
      | 'description'
      | 'quantity'
      | 'unit_price'
      | 'discount_type'
      | 'discount_value'
      | 'tax_rate'
      | 'tax_value'
      | 'billing_interval'
      | 'billing_frequency'
      | 'billing_anchor'
      | 'trial_until'
      | 'proration_mode'
      | 'currency'
      | 'metadata'
    >
  ): string {
    return BillingItemDefinitionHasher.hash(extractBillingItemDefinitionPayload(item));
  }
}
