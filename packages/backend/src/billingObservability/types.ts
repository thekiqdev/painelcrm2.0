/**
 * Billing Engine 3.0 — observability types.
 */
export const BILLING_OBSERVABILITY_VERSION = 'v3_observability_ga';

export type BillingPipelineStage =
  | 'ExecutionContext'
  | 'BillingEngine'
  | 'ExecutionOrchestrator'
  | 'Gateway'
  | 'Notifications'
  | 'Timeline'
  | 'History'
  | 'SubscriptionAdvance';

export type BillingMetricsSnapshot = {
  renewals_total: number;
  renewals_success: number;
  renewals_failed: number;
  gateway_success_rate: number | null;
  notification_success_rate: number | null;
  timeline_success_rate: number | null;
  history_success_rate: number | null;
  average_execution_time: number | null;
  max_execution_time: number | null;
  job_retry_rate: number | null;
  idempotency_hits: number;
  orphan_jobs: number | null;
  engine_errors: number;
  context_errors: number;
  billing_plan_errors: number;
  billing_items_errors: number;
  last_renewal_at: string | null;
  pipeline_version: string;
};

export type BillingDashboardCard = {
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  status: 'ok' | 'warning' | 'critical';
};

export type BillingHealthCheck = {
  stage: BillingPipelineStage;
  healthy: boolean;
  score: number;
  message: string;
  last_checked_at: string;
};

export type BillingHealthSummary = {
  healthy: boolean;
  overall_score: number;
  checks: BillingHealthCheck[];
  version: string;
};

export type BillingOperationalAuditIssue = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  count: number;
  detail: string;
};

export type BillingOperationalAuditReport = {
  version: string;
  audited_at: string;
  healthy: boolean;
  issues: BillingOperationalAuditIssue[];
  metrics: BillingMetricsSnapshot;
  recommendations: string[];
};

export type BillingPerformanceStageTiming = {
  stage: string;
  duration_ms: number;
};

export type BillingPerformanceProfile = {
  correlation_id: string;
  subscription_id: string;
  job_id: string;
  total_duration_ms: number;
  stages: BillingPerformanceStageTiming[];
  outcome: 'success' | 'failed';
  recorded_at: string;
};

export type BillingRenewalObservation = {
  success: boolean;
  duration_ms: number;
  idempotent: boolean;
  job_attempts: number;
  gateway_ok: boolean;
  notification_ok: boolean;
  timeline_ok: boolean;
  history_ok: boolean;
  subscription_advanced: boolean;
  error_code?: string;
  error_stage?: string;
  context_build_ms?: number;
  orchestrator_ms?: number;
};
