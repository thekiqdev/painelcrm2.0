import type { FinancialEventType } from '@/lib/financialEventTypes';
import type {
  CrmSubscriptionAutomationSummary,
  CrmSubscriptionDetailPayload,
  CrmSubscriptionJobRow,
  CrmSubscriptionStats,
  CrmSubscriptionTenantBillingPrefs,
  CrmSubscriptionTimelineRow,
} from '@/services/crmSubscriptions';

/** Snapshot de ciclo no Aggregate (espelha `cycles_raw` — populado em sprints futuras). */
export type BillingCycleSnapshot = {
  id: string;
  cycle_date: string;
  period_start: string;
  period_end: string;
  status: string;
  invoice_id: string | null;
  job_id: string | null;
  processed_at: string | null;
  skipped_reason: string | null;
  error_message: string | null;
};

/** Snapshot de fatura (Billing 5.0 — §6.1 constituição 4.2R). */
export type BillingInvoiceSnapshot = {
  id: string;
  subscription_cycle_id: string | null;
  status: string;
  amount_cents: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  gateway_status: string | null;
  gateway_reference_id: string | null;
};

export type BillingSubscriptionMetadata = {
  planId: string | null;
  gateway: string | null;
  gracePeriodDays: number;
  defaultPaymentMethod: string | null;
  usersCount: number | null;
  lastJobAt: string | null;
  createdBy: string | null;
  cyclesUnlimited: boolean | null;
  maxCycles: number | null;
};

/** Snapshot normalizado da assinatura (Sprint 5.0-12). */
export type BillingSubscriptionSnapshot = {
  id: string;
  tenantId: string;
  customerId: string | null;
  status: string;
  subscriptionType: string;
  billingInterval: string;
  billingIntervalCount: number;
  currency: string;
  amount: number;
  nextBillingDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  billingAnchorDay: number | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  pausedAt: string | null;
  reactivatedAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: BillingSubscriptionMetadata;
};

export type BillingFinancialEventSnapshot = {
  id: string;
  type: FinancialEventType;
  cycleId: string | null;
  invoiceId: string | null;
  ymd: string;
  dueYmd: string | null;
  kind: 'real' | 'projected';
};

export type BillingHistorySnapshot = {
  id: string;
  cycleId: string | null;
  invoiceId: string | null;
  dueYmd: string | null;
  statusLabel: string;
  canGenerate: boolean;
  isProjected: boolean;
};

export type BillingCalendarSnapshot = {
  id: string;
  ymd: string;
  cycleId: string | null;
  invoiceId: string | null;
  isProjected: boolean;
  supportsGenerate: boolean;
};

export type BillingSidebarSnapshot = {
  nextReceiptDate: string;
  openAmount: string;
  alertCount: number;
};

export type BillingNextInvoiceSnapshot = {
  cycleId: string | null;
  invoiceId: string | null;
  dueYmd: string | null;
  statusLabel: string;
  showGenerate: boolean;
  isProjected: boolean;
};

export type BillingAlertSnapshot = {
  id: string;
  kind: string;
  title: string;
};

export type BillingCapabilitySnapshot = {
  canGenerate: boolean;
  supportsGenerate: boolean;
};

export type BillingTechnicalSnapshot = {
  workerStatus: string | null;
  engineVersion: string | null;
};

/**
 * Read-model oficial do Billing 5.0.
 * Sprint 5.0-11: estrutura vazia — views populadas em sprints posteriores.
 */
export type BillingAggregate = {
  subscriptionId: string;
  builtAt: string;
  todayYmd: string;
  subscription: BillingSubscriptionSnapshot;
  cycles: BillingCycleSnapshot[];
  invoices: BillingInvoiceSnapshot[];
  timeline: CrmSubscriptionTimelineRow[];
  events: BillingFinancialEventSnapshot[];
  history: BillingHistorySnapshot[];
  calendar: BillingCalendarSnapshot[];
  sidebar: BillingSidebarSnapshot;
  nextInvoice: BillingNextInvoiceSnapshot;
  alerts: BillingAlertSnapshot[];
  capabilities: BillingCapabilitySnapshot;
  technical: BillingTechnicalSnapshot;
  /** Assinatura do payload de entrada — rastreabilidade sem mutação. */
  sourceSignature: string;
};

export type BillingContext = {
  readonly source: CrmSubscriptionDetailPayload;
  readonly todayYmd: string;
  readonly builtAt: string;
};

export type BillingAggregateStage = (
  context: BillingContext,
  aggregate: BillingAggregate
) => BillingAggregate;

export type BillingContextValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Referências tipadas ao payload legado (entrada do builder). */
export type BillingContextSourceRefs = {
  stats: CrmSubscriptionStats;
  automationSummary: CrmSubscriptionAutomationSummary;
  tenantBilling: CrmSubscriptionTenantBillingPrefs;
  recentJobs: CrmSubscriptionJobRow[];
};

export function extractBillingContextSourceRefs(
  source: CrmSubscriptionDetailPayload
): BillingContextSourceRefs {
  return {
    stats: source.stats,
    automationSummary: source.automation_summary,
    tenantBilling: source.tenant_billing,
    recentJobs: source.recent_jobs,
  };
}
