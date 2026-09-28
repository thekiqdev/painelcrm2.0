/**
 * Billing Engine V2 — Sprint 2.3C: Billing Execution Context types.
 */
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import type { BillingPlanRow } from '../billingPlan/types.js';
import type { SubscriptionRow } from '../services/billingSubscriptionService.js';

export type ResolvedBillingItem = {
  item: BillingPlanItemRow;
  effectiveRevision: number;
  effectiveDates: { from: string; until: string | null };
  resolvedPrice: number;
  resolvedQuantity: number;
  discounts: number;
  taxes: number;
  proration: string | null;
  trial: string | null;
  metadata: Record<string, unknown>;
  definitionHash: string;
};

export type ResolvedBillingPeriod = {
  cycleKey: string;
  periodStart: string;
  periodEnd: string | null;
  dueDate: string;
  nextGeneration: string | null;
  anchor: number | null;
  interval: string;
  frequency: number;
};

export type ResolvedGatewayContext = {
  provider: string | null;
  currency: string;
  paymentMethod: string | null;
  fees: number;
  gatewayMetadata: Record<string, unknown>;
};

export type ResolvedNotificationContext = {
  channels: string[];
  templates: string[];
  recipient: string | null;
  language: string;
  variables: Record<string, unknown>;
};

export type ResolvedTenantContext = {
  id: string;
  name: string | null;
};

export type ResolvedCustomerContext = {
  id: string;
  name: string | null;
  email: string | null;
};

export type ResolvedContractContext = {
  billing_interval: string;
  amount_cents: number;
  currency: string;
  trial_until: string | null;
  status: string;
  metadata: Record<string, unknown>;
};

export type ResolvedTimelineContext = {
  events: Array<{ event: string; order: number }>;
};

export type ResolvedHistoryContext = {
  changes: Array<{ change: string; audit: Record<string, unknown> }>;
};

export type BillingExecutionFeatureFlags = Record<string, never>;

export type ExecutionDiagnostics = {
  contextBuildTime: number;
  warnings: string[];
  errors: string[];
  sources: Record<string, string>;
  shadowReady: boolean;
  consistencyReady: boolean;
  engineReady: boolean;
  cacheHit: boolean;
  billing_plan_present: boolean;
  billing_items_present: boolean;
  context_certified: boolean;
  context_pure: boolean;
  legacy_dependencies_detected: string[];
};

export type BillingExecutionContext = {
  subscription: SubscriptionRow;
  tenant: ResolvedTenantContext;
  customer: ResolvedCustomerContext | null;
  billingPlan: BillingPlanRow;
  billingPlans: BillingPlanRow[];
  billingItems: BillingPlanItemRow[];
  resolvedItems: ResolvedBillingItem[];
  contract: ResolvedContractContext;
  cycle: string;
  period: ResolvedBillingPeriod;
  dates: {
    periodStart: string;
    periodEnd: string | null;
    dueDate: string;
    nextBilling: string;
    trialUntil: string | null;
  };
  gateway: ResolvedGatewayContext;
  notifications: ResolvedNotificationContext;
  timeline: ResolvedTimelineContext;
  history: ResolvedHistoryContext;
  featureFlags: BillingExecutionFeatureFlags;
  metadata: {
    correlation_id: string | null;
    execution_mode: string | null;
    plan_source: 'persisted_plan';
    has_persisted_plan: true;
    context_certified: boolean;
  };
  diagnostics: ExecutionDiagnostics;
};

export type BuildBillingExecutionContextInput = {
  subscriptionId: string;
  tenantId: string;
  cycleKey: string;
  periodStartYmd: string;
  periodEndYmd?: string | null;
  correlationId?: string;
  executionMode?: string;
  skipCache?: boolean;
};

export type BillingExecutionContextHealthStats = {
  healthy: boolean;
  builder_time_avg: number | null;
  cache_hit_rate: number | null;
  last_failure: string | null;
  last_build: string | null;
  contexts_built: number;
  builder_errors: number;
  builder_warnings: number;
};

export type BillingExecutionContextDashboard = {
  contexts_built: number;
  average_build_time_ms: number | null;
  cache_hit_rate: number | null;
  builder_errors: number;
  builder_warnings: number;
};
