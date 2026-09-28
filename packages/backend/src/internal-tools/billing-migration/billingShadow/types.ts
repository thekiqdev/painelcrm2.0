/**
 * Billing Engine V2 — Sprint 2.3: Shadow Mode types.
 */
import type { BillingPlanItemRow } from '../../../billingPlanItems/types.js';
import type { BillingPlanRow } from '../../../billingPlan/types.js';
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import type { BillingRenewalExecutionMode } from '../../../services/billingRenewalEngine/types.js';
import type { SubscriptionRow } from '../../../services/billingSubscriptionService.js';

export type ShadowComparisonSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type NormalizedSubscriptionSlice = {
  id: string;
  customer: string | null;
  tenant: string;
  status: string;
};

export type NormalizedBillingSlice = {
  billing_interval: string;
  billing_frequency: number;
  anchor: number | null;
  trial: string | null;
};

export type NormalizedRenewalItem = {
  sequence: number;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  currency: string;
  total: number;
  definition_hash: string | null;
  name: string;
};

export type NormalizedGatewayPayload = {
  payment_method: string | null;
  currency: string;
  amount: number;
  payload: Record<string, unknown>;
};

export type NormalizedNotificationPayload = {
  type: string;
  recipient: string | null;
  template: string | null;
  payload: Record<string, unknown>;
};

export type NormalizedTimelineEvent = {
  event: string;
  order: number;
};

export type NormalizedHistoryEvent = {
  change: string;
  audit: Record<string, unknown>;
};

export type NormalizedSideEffects = {
  invoice: boolean;
  notification: boolean;
  timeline: boolean;
  history: boolean;
  gateway: boolean;
};

export type NormalizedRenewalResult = {
  subscription: NormalizedSubscriptionSlice;
  cycle: string;
  billingPlanVersion: number | null;
  itemCount: number;
  items: NormalizedRenewalItem[];
  subtotal: number;
  discounts: number;
  taxes: number;
  total: number;
  currency: string;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  gatewayPayload: NormalizedGatewayPayload | null;
  notificationPayload: NormalizedNotificationPayload | null;
  timelineEvents: NormalizedTimelineEvent[];
  historyEvents: NormalizedHistoryEvent[];
  sideEffects: NormalizedSideEffects;
  metadata: Record<string, unknown>;
};

export type RenewalComparisonDifference = {
  field: string;
  legacy_value: unknown;
  shadow_value: unknown;
  severity: ShadowComparisonSeverity;
  reason: string;
};

export type RenewalComparisonResult = {
  legacy: NormalizedRenewalResult;
  shadow: NormalizedRenewalResult;
  differences: RenewalComparisonDifference[];
  score: number;
  approved: boolean;
  severity: ShadowComparisonSeverity;
  comparison_time_ms: number;
};

export type ShadowExecutionResult = {
  success: boolean;
  normalized: NormalizedRenewalResult;
  engineVersion: string;
  duration_ms: number;
  logs: string[];
  errorCode?: string;
};

export type LegacyExecutionResult = {
  normalized: NormalizedRenewalResult;
  raw: {
    invoiceId: string | null;
    success: boolean;
    completionOutcome: string | null;
  };
};

export type BillingShadowReport = {
  subscription_id: string;
  tenant_id: string;
  cycle: string;
  correlation_id: string | null;
  comparison: RenewalComparisonResult;
  summary: string;
  differences: RenewalComparisonDifference[];
  score: number;
  approved: boolean;
  duration_ms: number;
  engine_versions: {
    legacy: string;
    shadow: string;
  };
  execution_failed?: boolean;
  error_code?: string | null;
  consistency_failed?: boolean;
  consistency_confidence?: number | null;
  consistency_reason?: string | null;
  projection_duration_ms?: number | null;
  projection_score?: number | null;
  projection_version?: string | null;
  projection_engine_version?: string | null;
  projection_hash?: string | null;
  projection_success?: boolean | null;
};

export type BillingShadowExecuteInput = {
  executionContext: BillingExecutionContext;
};
