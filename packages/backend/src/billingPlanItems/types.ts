/**
 * Billing Engine V2 — Sprint 2.2: Billing Plan Items (regra de cobrança).
 */

export type BillingPlanItemStatus =
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'archived'
  | 'draft';

export type BillingPlanItemType =
  | 'product'
  | 'service'
  | 'fee'
  | 'adjustment'
  | 'discount'
  | 'shipping'
  | 'custom';

export type BillingPlanItemOrigin =
  | 'subscription'
  | 'manual'
  | 'migration'
  | 'contract'
  | 'future';

export type BillingPlanItemDiscountType = 'none' | 'fixed' | 'percent';

export type BillingPlanItemProrationMode = 'none' | 'daily' | 'monthly' | 'cycle';

export type BillingPlanItemSnapshotStrategy =
  | 'invoice_snapshot'
  | 'logical_snapshot'
  | 'future';

export type BillingPlanItemRow = {
  id: string;
  tenant_id: string;
  billing_plan_id: string;
  sequence: number;
  status: BillingPlanItemStatus;
  item_type: BillingPlanItemType;
  origin: BillingPlanItemOrigin;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_type: BillingPlanItemDiscountType | null;
  discount_value: number;
  tax_rate: number | null;
  tax_value: number;
  total_amount: number;
  currency: string;
  is_recurring: boolean;
  billing_interval: string | null;
  billing_frequency: number;
  billing_anchor: number | null;
  proration_mode: BillingPlanItemProrationMode | null;
  starts_at: string | null;
  ends_at: string | null;
  trial_until: string | null;
  definition_hash: string;
  item_revision: number;
  effective_from: string;
  effective_until: string | null;
  created_from_revision: number | null;
  superseded_by_revision: number | null;
  snapshot_strategy: BillingPlanItemSnapshotStrategy;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BillingPlanItemCreateInput = {
  tenant_id: string;
  billing_plan_id: string;
  sequence: number;
  status?: BillingPlanItemStatus;
  item_type?: BillingPlanItemType;
  origin?: BillingPlanItemOrigin;
  name: string;
  description?: string | null;
  quantity?: number;
  unit_price: number;
  discount_type?: BillingPlanItemDiscountType | null;
  discount_value?: number;
  tax_rate?: number | null;
  tax_value?: number;
  total_amount: number;
  currency: string;
  is_recurring?: boolean;
  billing_interval?: string | null;
  billing_frequency?: number;
  billing_anchor?: number | null;
  proration_mode?: BillingPlanItemProrationMode | null;
  starts_at?: string | null;
  ends_at?: string | null;
  trial_until?: string | null;
  definition_hash?: string;
  item_revision?: number;
  effective_from?: string;
  effective_until?: string | null;
  created_from_revision?: number | null;
  superseded_by_revision?: number | null;
  snapshot_strategy?: BillingPlanItemSnapshotStrategy;
  metadata?: Record<string, unknown>;
};

export type BillingPlanItemUpdateInput = {
  id: string;
  tenant_id: string;
  name?: string;
  description?: string | null;
  quantity?: number;
  unit_price?: number;
  discount_type?: BillingPlanItemDiscountType | null;
  discount_value?: number;
  tax_rate?: number | null;
  tax_value?: number;
  total_amount?: number;
  billing_interval?: string | null;
  billing_frequency?: number;
  billing_anchor?: number | null;
  proration_mode?: BillingPlanItemProrationMode | null;
  starts_at?: string | null;
  ends_at?: string | null;
  trial_until?: string | null;
  definition_hash?: string;
  item_revision?: number;
  effective_from?: string;
  effective_until?: string | null;
  created_from_revision?: number | null;
  superseded_by_revision?: number | null;
  snapshot_strategy?: BillingPlanItemSnapshotStrategy;
  metadata?: Record<string, unknown>;
};

export type BillingPlanItemRevisionCompareResult = {
  leftRevision: number;
  rightRevision: number;
  definitionHashEqual: boolean;
  leftHash: string;
  rightHash: string;
};

/** Input mínimo de invoice para factory (sem acoplar ao motor). */
export type BillingPlanItemInvoiceSource = {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  currency?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  due_date?: string | null;
};

/** Input mínimo de invoice line para mapper/factory. */
export type BillingPlanItemInvoiceLineSource = {
  id: string;
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  total_cents: number;
  sort_order: number;
  is_recurring: boolean;
  recurring_interval?: string | null;
  scheduled_due_date?: string | null;
};
