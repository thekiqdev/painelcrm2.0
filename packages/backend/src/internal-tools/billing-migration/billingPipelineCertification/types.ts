/**
 * Billing Engine V2 — Sprint 3.0E: Production Pipeline Certification types.
 */
import type { BillingRenewalResult } from '../../../services/billingRenewalEngine/types.js';
import type { BillingExecutionStageResult } from '../../../billingExecution/types.js';

export const PIPELINE_CERTIFICATION_VERSION = 'v2_pipeline_certification_sprint_3_0e';

export type PipelineCertificationScenarioId =
  | 'simple_renewal'
  | 'monthly'
  | 'annual'
  | 'trial'
  | 'discount'
  | 'taxes'
  | 'gateway_approved'
  | 'gateway_refused'
  | 'notification_failure'
  | 'timeline_failure'
  | 'history_failure'
  | 'rollback'
  | 'idempotency'
  | 'concurrency'
  | 'retry'
  | 'subscription_advance'
  | 'billing_result_parity';

export type PipelineCertificationScenarioDef = {
  id: PipelineCertificationScenarioId;
  name: string;
  description: string;
  tags: string[];
};

export type PipelineInvoiceSnapshot = {
  period_start: string;
  period_end: string;
  amount_cents: number;
  due_date: string;
  gateway: string | null;
  currency: string;
  subtotal_cents: number;
  discounts_cents: number;
  taxes_cents: number;
  status: string;
};

export type PipelineInvoiceItemSnapshot = {
  sequence: number;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  is_recurring: boolean;
};

export type PipelineGatewaySnapshot = {
  amount_cents: number;
  due_date: string;
  payment_method: string | null;
  idempotency_key_prefix: string;
  status: string | null;
  failed: boolean;
};

export type PipelineNotificationSnapshot = {
  status: string;
  queued: boolean;
};

export type PipelineTimelineSnapshot = {
  status: string;
  event_types: string[];
  events_recorded: number;
};

export type PipelineHistorySnapshot = {
  status: string;
  result_outcome: string | null;
};

export type PipelineSubscriptionSnapshot = {
  advanced: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  next_billing_date: string | null;
};

export type PipelineBillingJobSnapshot = {
  completion_outcome: string | null;
  idempotent: boolean;
};

export type PipelineBillingResultSnapshot = {
  success: boolean;
  invoice_id_present: boolean;
  gateway_status: string | null;
  notification_status: string;
  timeline_status: string;
  history_status: string;
  subscription_advanced: boolean;
  completion_outcome: string | null;
};

export type PipelineErrorSnapshot = {
  code: string;
  stage: string;
} | null;

export type PipelineIdempotencySnapshot = {
  reused_existing: boolean;
  engine_skipped: boolean;
};

export type PipelineRollbackSnapshot = {
  triggered: boolean;
  invoice_deleted: boolean;
};

export type PipelineOperationalSnapshot = {
  scenario_id: string;
  invoice: PipelineInvoiceSnapshot | null;
  invoice_items: PipelineInvoiceItemSnapshot[];
  gateway: PipelineGatewaySnapshot | null;
  notification: PipelineNotificationSnapshot;
  timeline: PipelineTimelineSnapshot;
  history: PipelineHistorySnapshot;
  subscription: PipelineSubscriptionSnapshot;
  billing_job: PipelineBillingJobSnapshot;
  billing_result: PipelineBillingResultSnapshot;
  error: PipelineErrorSnapshot;
  idempotency: PipelineIdempotencySnapshot;
  rollback: PipelineRollbackSnapshot;
};

export type PipelineCompareDifference = {
  dimension:
    | 'invoice'
    | 'invoice_items'
    | 'gateway'
    | 'notification'
    | 'timeline'
    | 'history'
    | 'subscription'
    | 'billing_job'
    | 'billing_result'
    | 'error'
    | 'idempotency'
    | 'rollback';
  field: string;
  legacy_value: unknown;
  v2_value: unknown;
  blocking: boolean;
};

export type PipelineGateScore = {
  dimension: PipelineCompareDifference['dimension'];
  score: number;
  passed: boolean;
  differences: PipelineCompareDifference[];
};

export type PipelineCompareResult = {
  scenario_id: string;
  gates: PipelineGateScore[];
  overall_score: number;
  approved: boolean;
  differences: PipelineCompareDifference[];
};

export type BillingProductionCertificationReport = {
  version: string;
  correlation_id: string;
  overall_score: number;
  approved: boolean;
  invoice_score: number;
  invoice_items_score: number;
  gateway_score: number;
  notification_score: number;
  timeline_score: number;
  history_score: number;
  subscription_score: number;
  billing_result_score: number;
  idempotency_score: number;
  rollback_score: number;
  blocking_issues: string[];
  warnings: string[];
  recommendation: 'APPROVED' | 'NOT_APPROVED';
  scenarios: PipelineCompareResult[];
  certified_at: string;
};

export type LegacyPipelineCapture = {
  scenario_id: string;
  renewal: BillingRenewalResult;
  invoice?: PipelineInvoiceSnapshot | null;
  invoice_items?: PipelineInvoiceItemSnapshot[];
  gateway?: PipelineGatewaySnapshot | null;
  subscription?: Partial<PipelineSubscriptionSnapshot>;
  idempotency?: Partial<PipelineIdempotencySnapshot>;
  rollback?: Partial<PipelineRollbackSnapshot>;
  error?: PipelineErrorSnapshot;
};

export type V2PipelineCapture = {
  scenario_id: string;
  stage: BillingExecutionStageResult;
  invoice?: PipelineInvoiceSnapshot | null;
  invoice_items?: PipelineInvoiceItemSnapshot[];
  gateway?: PipelineGatewaySnapshot | null;
  subscription?: Partial<PipelineSubscriptionSnapshot>;
  idempotency?: Partial<PipelineIdempotencySnapshot>;
  rollback?: Partial<PipelineRollbackSnapshot>;
  error?: PipelineErrorSnapshot;
};
