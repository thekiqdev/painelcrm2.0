/**
 * Billing Plan types — Billing Engine 3.0.
 */
export type BillingPlanStatus = 'draft' | 'active' | 'archived' | 'cancelled';

export type BillingPlanCreatedFrom =
  | 'subscription'
  | 'checkout'
  | 'manual'
  | 'api'
  | 'import'
  | 'migration';

export type BillingPlanEngineVersion = 'v1' | 'v2' | 'future';

export type BillingPlanBillingStrategy =
  | 'billing_plan_items'
  | 'mixed'
  | 'future';
export type BillingPlanState =
  | 'draft'
  | 'running'
  | 'paused'
  | 'expired'
  | 'completed'
  | 'cancelled';

export type BillingPlanRow = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  plan_number: string;
  status: BillingPlanStatus;
  version: number;
  plan_revision: number;
  plan_state: BillingPlanState;
  created_from: BillingPlanCreatedFrom;
  engine_version: BillingPlanEngineVersion;
  billing_strategy: BillingPlanBillingStrategy;
  currency: string;
  billing_interval: string;
  billing_frequency: number;
  billing_anchor: number | null;
  starts_at: string;
  ends_at: string | null;
  trial_until: string | null;
  next_generation_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BillingPlanCreateInput = {
  tenant_id: string;
  subscription_id: string;
  plan_number?: string;
  status: BillingPlanStatus;
  version: number;
  plan_revision?: number;
  plan_state?: BillingPlanState;
  created_from?: BillingPlanCreatedFrom;
  engine_version?: BillingPlanEngineVersion;
  billing_strategy?: BillingPlanBillingStrategy;
  currency: string;
  billing_interval: string;
  billing_frequency: number;
  billing_anchor: number | null;
  starts_at: string;
  ends_at: string | null;
  trial_until: string | null;
  next_generation_at: string | null;
  metadata?: Record<string, unknown>;
};

export type BillingPlanUpdateMetadataInput = {
  id: string;
  tenant_id: string;
  metadata: Record<string, unknown>;
};

/** Conceito — sem persistência (Sprint 2.1A). */
export type BillingCycleStatus =
  | 'scheduled'
  | 'awaiting_generation'
  | 'processing'
  | 'invoiced'
  | 'skipped'
  | 'failed'
  | 'cancelled';

export type BillingCycle = {
  id: string;
  cycle_key: string;
  starts_at: string;
  ends_at: string;
  due_at: string;
  status: BillingCycleStatus;
  invoice_id: string | null;
  renewal_result: string | null;
};

/** Conceito — sem persistência (Sprint 2.1A). */
export type BillingRule = {
  billing_interval: string;
  billing_frequency: number;
  billing_anchor: number | null;
  proration_enabled: boolean;
  trial_until: string | null;
  generation_days_before_due: number | null;
  retry_max_attempts: number | null;
  grace_period_days: number | null;
};
