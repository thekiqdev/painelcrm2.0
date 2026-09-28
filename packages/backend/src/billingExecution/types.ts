/**
 * Billing Engine 3.0 — Execution Orchestrator types.
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { BillingEngineResult } from '../billingEngine/types.js';
import type {
  BillingRenewalExecutionMode,
  BillingRenewalJobRef,
  BillingRenewalResult,
} from '../services/billingRenewalEngine/types.js';
import type { CustomerInvoiceRow } from '../services/customerInvoiceService.js';

export const EXECUTION_ORCHESTRATOR_VERSION = 'v3_execution_orchestrator_ga';

export type DbQueryable = {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

export type BillingExecutionOrchestratorInput = {
  context: BillingExecutionContext;
  client: DbQueryable;
  job: BillingRenewalJobRef;
  workerId: string;
  executionMode: BillingRenewalExecutionMode;
  periodStartYmd: string;
  correlationId?: string;
};

export type PersistedInvoiceBundle = {
  invoice: CustomerInvoiceRow;
  itemCount: number;
  idempotentReuse: boolean;
};

export type GatewayExecutionOutcome = {
  status: string | null;
  paymentId: string | null;
  failed: boolean;
  error?: string;
};

export type NotificationExecutionOutcome = {
  status: 'queued' | 'sent' | 'skipped' | 'unknown';
};

export type TimelineExecutionOutcome = {
  status: 'ok' | 'skipped' | 'failed';
  eventsRecorded: number;
};

export type HistoryExecutionOutcome = {
  status: 'ok' | 'skipped' | 'failed';
};

export type SubscriptionAdvanceOutcome = {
  advanced: boolean;
};

export type BillingExecutionStageResult = {
  engine: BillingEngineResult | null;
  persisted: PersistedInvoiceBundle;
  gateway: GatewayExecutionOutcome;
  notification: NotificationExecutionOutcome;
  timeline: TimelineExecutionOutcome;
  history: HistoryExecutionOutcome;
  subscription: SubscriptionAdvanceOutcome;
  renewal: BillingRenewalResult;
};

export class BillingExecutionOrchestratorError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly stage?: string
  ) {
    super(message);
    this.name = 'BillingExecutionOrchestratorError';
  }
}
