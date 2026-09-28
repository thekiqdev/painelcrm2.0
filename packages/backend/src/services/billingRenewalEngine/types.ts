import type { SubscriptionRow } from '../billingSubscriptionService.js';
import type { RenewalValidationContext, RenewalValidationResult } from '../renewalValidationPipeline.js';

export type BillingRenewalExecutionMode =
  | 'automatic'
  | 'manual'
  | 'scheduler'
  | 'recovery'
  | 'api';

export type BillingRenewalJobRef = {
  id: string;
  subscription_id: string;
  tenant_id: string;
  job_type: string;
  cycle_key: string;
  scheduled_at: string;
  retry_at: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
};

export type BillingRenewalCycleInfo = {
  cycleKey: string;
  periodStartYmd: string;
  periodEndYmd?: string;
};

export type BillingRenewalRepairInfo = {
  repairs: string[];
  validationResult?: RenewalValidationResult;
};

/** Contexto unificado de execução do motor de renovação (B0.3). */
export type BillingRenewalExecutionContext = {
  subscription: SubscriptionRow;
  tenantId: string;
  customerId?: string | null;
  contract?: {
    has_crm_contract: boolean;
    amount_cents?: number | null;
    billing_interval?: string | null;
  };
  invoiceTemplate?: {
    resolved_via: string | null;
    prev_invoice_id?: string | null;
  };
  cycle: BillingRenewalCycleInfo;
  executionMode: BillingRenewalExecutionMode;
  correlationId: string;
  workerId: string;
  job: BillingRenewalJobRef;
  repairInfo: BillingRenewalRepairInfo;
  validationContext?: RenewalValidationContext;
};

export type BillingRenewalNotificationStatus = 'queued' | 'sent' | 'skipped' | 'unknown';

export type BillingRenewalPhaseStatus = 'ok' | 'skipped' | 'failed' | 'not_applicable';

/** Resultado estruturado de uma execução do motor (B0.3). */
export type BillingRenewalResult = {
  success: boolean;
  cancelled?: boolean;
  invoiceId: string | null;
  invoiceNumber?: string | null;
  gatewayStatus: string | null;
  notificationStatus: BillingRenewalNotificationStatus;
  timelineStatus: BillingRenewalPhaseStatus;
  historyStatus: BillingRenewalPhaseStatus;
  subscriptionAdvanced: boolean;
  completionOutcome: string | null;
  executionTime: number;
  logs: string[];
  cycleKey: string;
  executionMode: BillingRenewalExecutionMode;
  correlationId: string;
};

export type BillingRenewalExecuteInput = {
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
  subscriptionId: string;
  cycleKey: string;
  executionMode: BillingRenewalExecutionMode;
  jobId: string;
  workerId: string;
  correlationId?: string;
  subscription: SubscriptionRow;
  periodStartYmd: string;
  options?: Record<string, unknown>;
};
