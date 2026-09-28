/**
 * Billing Engine V2 — Sprint 2.3D: Billing Projection Engine types (READ ONLY).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { ResolvedBillingPeriod } from '../billingExecutionContext/types.js';
import type {
  NormalizedGatewayPayload,
  NormalizedHistoryEvent,
  NormalizedNotificationPayload,
  NormalizedTimelineEvent,
} from '../internal-tools/billing-migration/billingShadow/types.js';

export const PROJECTION_ENGINE_VERSION = 'v2_projection_sprint_2_3d';
export const PROJECTION_BUILDER_VERSION = '1.0.0';

export type ProjectionStage =
  | 'ProjectionValidation'
  | 'ProjectionItems'
  | 'ProjectionPricing'
  | 'ProjectionDiscounts'
  | 'ProjectionTaxes'
  | 'ProjectionGateway'
  | 'ProjectionNotification'
  | 'ProjectionTimeline'
  | 'ProjectionHistory'
  | 'ProjectionTotals'
  | 'ProjectionComplete';

export type ProjectedInvoiceHeader = {
  subscription_id: string;
  tenant_id: string;
  customer_id: string | null;
  cycle_key: string;
  billing_plan_id: string;
  billing_plan_version: number;
  currency: string;
};

export type ProjectedInvoiceItem = {
  sequence: number;
  definitionHash: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  subtotal: number;
  total: number;
  currency: string;
  billingRule: string | null;
  effectiveRevision: number;
};

export type ProjectionDiagnostics = {
  calculationTime: number;
  warnings: string[];
  errors: string[];
  hash: string;
  calculatorVersions: Record<string, string>;
  cacheHit: boolean;
  builderVersion: string;
};

export type ProjectedInvoice = {
  invoice: ProjectedInvoiceHeader;
  invoiceItems: ProjectedInvoiceItem[];
  subtotal: number;
  discounts: number;
  taxes: number;
  fees: number;
  grandTotal: number;
  currency: string;
  period: ResolvedBillingPeriod;
  dueDate: string | null;
  gateway: NormalizedGatewayPayload | null;
  notifications: NormalizedNotificationPayload | null;
  timeline: NormalizedTimelineEvent[];
  history: NormalizedHistoryEvent[];
  metadata: Record<string, unknown>;
  diagnostics: ProjectionDiagnostics;
};

export type ProjectionResult = {
  projectedInvoice: ProjectedInvoice;
  projectionWarnings: string[];
  projectionErrors: string[];
  duration: number;
  approved: boolean;
  diagnostics: ProjectionDiagnostics;
};

export type ProjectBillingInput = {
  context: BillingExecutionContext;
  skipCache?: boolean;
};

export type BillingProjectionHealthStats = {
  healthy: boolean;
  average_projection_time: number | null;
  projection_cache_hit: number | null;
  projection_failures: number;
  last_projection: string | null;
  projection_hash_mismatch: number;
};

export type BillingProjectionDashboard = {
  projections_built: number;
  average_projection_time_ms: number | null;
  cache_hit_rate: number | null;
  projection_failures: number;
  projection_hash_mismatch: number;
};
