/**
 * Billing Engine V2 — Sprint 2.3F: Migration Simulator types.
 */
import type { BillingConsistencyResult } from '../../../billingConsistency/types.js';
import type { ProjectedInvoice, ProjectionResult } from '../../../billingProjection/types.js';
import type {
  NormalizedRenewalResult,
  RenewalComparisonResult,
} from '../billingShadow/types.js';

export const MIGRATION_SIMULATOR_ENGINE_VERSION = 'v2_migration_simulator_sprint_2_3f';

export type MigrationRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type MigrationSimulationRecommendation =
  | 'READY_TO_MIGRATE'
  | 'READY_WITH_WARNINGS'
  | 'REQUIRES_REVIEW'
  | 'BLOCKED'
  | 'DO_NOT_MIGRATE';

export type MigrationImpactDifference = {
  field: string;
  legacy_value: unknown;
  projected_value: unknown;
  severity: string;
  reason: string;
  category: 'invoice' | 'items' | 'values' | 'dates' | 'gateway' | 'notifications' | 'timeline' | 'history' | 'jobs';
};

export type MigrationFinancialImpact = {
  legacy_total_cents: number;
  projected_total_cents: number;
  difference_cents: number;
  difference_percent: number | null;
  subtotal_delta: number;
  discounts_delta: number;
  taxes_delta: number;
};

export type MigrationItemChange = {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  sequence: number;
  definition_hash: string | null;
  description: string;
  legacy_revision?: number | null;
  projected_revision?: number | null;
  changes?: string[];
};

export type MigrationNotificationImpact = {
  would_dispatch: boolean;
  templates: string[];
  recipients: string[];
  variables: Record<string, unknown>;
};

export type MigrationGatewayImpact = {
  identical: boolean;
  provider: string | null;
  currency: string | null;
  fees_delta: number;
  payment_method_match: boolean;
  payload_diff_fields: string[];
};

export type MigrationTimelineImpact = {
  identical: boolean;
  expected_events: string[];
  legacy_events: string[];
  order_match: boolean;
};

export type MigrationHistoryImpact = {
  identical: boolean;
  expected_changes: string[];
  legacy_changes: string[];
};

export type MigrationJobsImpact = {
  expected_job: boolean;
  scheduler_would_enqueue: boolean;
  worker_would_process: boolean;
  retry_expected: boolean;
  notes: string[];
};

export type MigrationImpact = {
  identical: boolean;
  score: number;
  risk: MigrationRiskLevel;
  differences: MigrationImpactDifference[];
  financialImpact: MigrationFinancialImpact;
  itemChanges: MigrationItemChange[];
  notificationImpact: MigrationNotificationImpact;
  gatewayImpact: MigrationGatewayImpact;
  timelineImpact: MigrationTimelineImpact;
  historyImpact: MigrationHistoryImpact;
  jobsImpact: MigrationJobsImpact;
};

export type RollbackPreview = {
  rollback_possible: boolean;
  rollback_steps: string[];
  notes: string[];
};

export type SubscriptionSimulationSlice = {
  subscription_id: string;
  cycle_key: string;
  projected_invoice: ProjectedInvoice;
  legacy_invoice: NormalizedRenewalResult;
  impact: MigrationImpact;
  comparison: RenewalComparisonResult;
  projection: ProjectionResult;
  consistency: BillingConsistencyResult;
  shadow_summary: Record<string, unknown> | null;
};

export type BillingMigrationSimulationReport = {
  tenant_id: string;
  tenant_name: string | null;
  correlation_id: string | null;
  subscriptions: SubscriptionSimulationSlice[];
  impact: MigrationImpact;
  comparison: RenewalComparisonResult | null;
  projection: ProjectionResult | null;
  consistency: BillingConsistencyResult | null;
  shadow: Record<string, unknown> | null;
  overall_score: number;
  recommended: MigrationSimulationRecommendation;
  rollback_safe: boolean;
  rollback_preview: RollbackPreview;
  generated_at: string;
  diagnostics: {
    duration_ms: number;
    engine_version: string;
    subscriptions_simulated: number;
  };
};

export type MigrationSimulatorDashboard = {
  total_simulations: number;
  average_score: number | null;
  average_duration_ms: number | null;
  high_risk: number;
  critical: number;
  ready_to_migrate: number;
  blocked: number;
  last_simulation: string | null;
  recent: Array<{
    tenant_id: string;
    score: number;
    recommendation: string;
    risk: string;
    generated_at: string;
  }>;
};

export type MigrationSimulatorHealthStats = {
  healthy: boolean;
  simulations: number;
  average_duration: number | null;
  average_score: number | null;
  high_risk: number;
  critical: number;
  last_simulation: string | null;
};
