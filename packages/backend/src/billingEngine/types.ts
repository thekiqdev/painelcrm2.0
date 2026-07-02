/**
 * Billing Engine 3.0 — GA types.
 */
import type { BillingExecutionContext, ExecutionDiagnostics } from '../billingExecutionContext/types.js';
import type {
  NormalizedGatewayPayload,
  NormalizedHistoryEvent,
  NormalizedNotificationPayload,
  NormalizedTimelineEvent,
} from '../internal-tools/billing-migration/billingShadow/types.js';
import type { ProjectionItemDraft } from '../billingProjection/projectionItemResolver.js';
import type { PricedProjectionItem } from '../billingProjection/projectionPriceCalculator.js';
import type { DiscountedProjectionItem } from '../billingProjection/projectionDiscountCalculator.js';
import type { TaxedProjectionItem } from '../billingProjection/projectionTaxCalculator.js';
import type { ProjectionTotals } from '../billingProjection/projectionTotalCalculator.js';

export const BILLING_ENGINE_VERSION = 'v3_billing_engine_ga';

export type CustomerInvoiceDraft = {
  tenant_id: string;
  client_id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  due_date: string;
  gateway: string | null;
  currency: string;
  cycle_key: string;
  billing_plan_id: string;
  billing_plan_version: number;
  billing_plan_revision: number;
  subtotal_cents: number;
  discounts_cents: number;
  taxes_cents: number;
  fees_cents: number;
  origin: 'subscription';
  invoice_type: 'subscription';
};

export type CustomerInvoiceItemDraft = {
  billing_plan_item_id: string;
  sequence: number;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  is_recurring: boolean;
  recurring_interval: string | null;
  definition_hash: string;
  item_revision: number;
};

export type BillingEngineDiagnostics = ExecutionDiagnostics & {
  engine_version: string;
  plan_source: string;
  projection_hash: string;
  duration_ms: number;
  warnings: string[];
  errors: string[];
};

export type BillingEngineResult = {
  invoice: CustomerInvoiceDraft;
  items: CustomerInvoiceItemDraft[];
  gateway: NormalizedGatewayPayload | null;
  notifications: NormalizedNotificationPayload[];
  timeline: NormalizedTimelineEvent[];
  history: NormalizedHistoryEvent[];
  diagnostics: BillingEngineDiagnostics;
  approved: boolean;
};

export type BillingEnginePipelineStage = {
  itemDrafts: ProjectionItemDraft[];
  priced: PricedProjectionItem[];
  discounted: DiscountedProjectionItem[];
  taxed: TaxedProjectionItem[];
  totals: ProjectionTotals;
  gateway: NormalizedGatewayPayload | null;
  notifications: NormalizedNotificationPayload | null;
  timeline: NormalizedTimelineEvent[];
  history: NormalizedHistoryEvent[];
};

export type BillingEngineInput = {
  context: BillingExecutionContext;
};

export class BillingEngineError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'BillingEngineError';
  }
}
