/**
 * Billing Engine V2 — Sprint 2.3B: Consistency Validator types.
 */
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import type { BillingPlanRow } from '../billingPlan/types.js';
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';

export type ConsistencySeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type ConsistencyCheckResult = {
  code: string;
  phase: 'plan' | 'items' | 'integration' | 'contract' | 'snapshot';
  passed: boolean;
  severity: ConsistencySeverity;
  message: string;
  field?: string;
  expected?: unknown;
  actual?: unknown;
};

export type BillingConsistencyResult = {
  valid: boolean;
  confidence: number;
  severity: ConsistencySeverity;
  score: number;
  approved: boolean;
  checks: ConsistencyCheckResult[];
  warnings: ConsistencyCheckResult[];
  errors: ConsistencyCheckResult[];
  metadata: {
    subscription_id: string;
    tenant_id: string;
    plan_id: string | null;
    plan_number: string | null;
    item_count: number;
    execution_ms: number;
    correlation_id?: string;
    has_persisted_plan: boolean;
  };
};

import type { BillingExecutionContext } from '../billingExecutionContext/types.js';

export type BillingConsistencyValidateInput = {
  subscriptionId: string;
  tenantId: string;
  correlationId?: string;
  cycleKey?: string;
  periodStartYmd?: string;
  executionContext?: BillingExecutionContext;
  persist?: boolean;
};

export type BillingConsistencyContext = {
  subscription: SubscriptionRow;
  plans: BillingPlanRow[];
  activePlan: BillingPlanRow | null;
  items: BillingPlanItemRow[];
  invoiceItems?: Array<{
    sort_order: number;
    description: string;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
  }>;
};

export type BillingConsistencyDashboard = {
  total_plans: number;
  healthy_plans: number;
  invalid_plans: number;
  average_confidence: number | null;
  average_score: number | null;
  critical_plans: number;
  warnings: number;
  top_problems: Array<{ code: string; count: number }>;
  last_validation: string | null;
};

export type BillingConsistencyHealthStats = {
  healthy: boolean;
  average_confidence: number | null;
  average_score: number | null;
  plans_validated: number;
  invalid_plans: number;
  critical_plans: number;
  last_validation: string | null;
};
