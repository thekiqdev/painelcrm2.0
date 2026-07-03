import type {
  CrmSubscriptionAutomationSummary,
  CrmSubscriptionDetailPayload,
  CrmSubscriptionJobRow,
  CrmSubscriptionStats,
  CrmSubscriptionTenantBillingPrefs,
  CrmSubscriptionTimelineRow,
} from '@/services/crmSubscriptions';

/** Metadados extras do ciclo (campos além do mapeamento canônico). */
export type BillingCycleMetadata = Record<string, unknown>;

/** Snapshot normalizado de ciclo (Sprint 5.0-13). */
export type BillingCycleSnapshot = {
  id: string;
  subscriptionId: string;
  cycleDate: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  invoiceId: string | null;
  jobId: string | null;
  processedAt: string | null;
  skippedReason: string | null;
  errorMessage: string | null;
  metadata: BillingCycleMetadata;
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

/** Tipos de evento do Aggregate Billing 5.0 (independente do motor legado). */
export type BillingFinancialEventType =
  | 'cycle_pending'
  | 'cycle_queued'
  | 'cycle_processing'
  | 'invoice_generated'
  | 'payment'
  | 'invoice_failed'
  | 'cycle_cancelled'
  | 'cycle_skipped'
  | 'cycle_unknown';

export type BillingFinancialEventMetadata = {
  invoiceId: string | null;
  jobId: string | null;
  periodStart: string;
  periodEnd: string;
  skippedReason: string | null;
  errorMessage: string | null;
  amount: number;
  currency: string;
  cycleMetadata: BillingCycleMetadata;
};

/** Evento financeiro canônico do Aggregate (Sprint 5.0-14). */
export type BillingFinancialEventSnapshot = {
  id: string;
  cycleId: string;
  subscriptionId: string;
  eventType: BillingFinancialEventType;
  occurredAt: string;
  status: string;
  metadata: BillingFinancialEventMetadata;
};

/** Metadados da linha de histórico (cópia do evento — sem regras). */
export type BillingHistoryRowMetadata = {
  invoiceId: string | null;
  jobId: string | null;
  periodStart: string;
  periodEnd: string;
  skippedReason: string | null;
  errorMessage: string | null;
  amount: number;
  currency: string;
  eventType: BillingFinancialEventType;
};

/** Linha de histórico do Aggregate (Sprint 5.0-15) — projeção 1:1 de events. */
export type BillingHistorySnapshot = {
  id: string;
  eventId: string;
  cycleId: string;
  subscriptionId: string;
  type: BillingFinancialEventType;
  status: string;
  date: string;
  title: string;
  metadata: BillingHistoryRowMetadata;
};

/** Metadados da entrada de calendário (cópia do evento — sem regras). */
export type BillingCalendarEntryMetadata = {
  invoiceId: string | null;
  jobId: string | null;
  periodStart: string;
  periodEnd: string;
  skippedReason: string | null;
  errorMessage: string | null;
  amount: number;
  currency: string;
};

/** Entrada de calendário do Aggregate (Sprint 5.0-16) — projeção 1:1 de events. */
export type BillingCalendarSnapshot = {
  id: string;
  eventId: string;
  cycleId: string;
  subscriptionId: string;
  date: string;
  eventType: BillingFinancialEventType;
  status: string;
  metadata: BillingCalendarEntryMetadata;
};

/** Metadados do resumo da sidebar (cópia — sem regras). */
export type BillingSidebarMetadata = {
  subscriptionId: string;
  tenantId: string;
  customerId: string | null;
  cancelAtPeriodEnd: boolean;
  nextBillingDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
};

/** Resumo da sidebar do Aggregate (Sprint 5.0-17). */
export type BillingSidebarSnapshot = {
  subscriptionStatus: string;
  subscriptionType: string;
  billingInterval: string;
  currency: string;
  amount: number;
  eventCount: number;
  lastEventDate: string | null;
  lastEventType: BillingFinancialEventType | null;
  metadata: BillingSidebarMetadata;
};

/** Metadados da próxima cobrança (cópia do evento — sem regras). */
export type BillingNextInvoiceMetadata = {
  invoiceId: string | null;
  jobId: string | null;
  periodStart: string;
  periodEnd: string;
  skippedReason: string | null;
  errorMessage: string | null;
  amount: number;
  currency: string;
};

/**
 * Próxima cobrança do Aggregate (Sprint 5.0-18).
 * Referência determinística a um FinancialEvent existente — ou `null` se não houver eventos.
 */
export type BillingNextInvoiceSnapshot = {
  eventId: string;
  cycleId: string;
  subscriptionId: string;
  eventType: BillingFinancialEventType;
  date: string;
  status: string;
  metadata: BillingNextInvoiceMetadata;
};

export type BillingAlertSeverity = 'info' | 'warning' | 'error';

export type BillingAlertKind =
  | 'no_events'
  | 'subscription_status'
  | 'invoice_failed'
  | 'cycle_cancelled'
  | 'next_invoice';

export type BillingAlertMetadata = {
  subscriptionId: string;
  subscriptionStatus: string;
  eventType: string | null;
  eventStatus: string | null;
  nextInvoiceEventId: string | null;
};

/** Alerta determinístico do Aggregate (Sprint 5.0-19). */
export type BillingAlertSnapshot = {
  id: string;
  kind: BillingAlertKind;
  severity: BillingAlertSeverity;
  title: string;
  description: string;
  eventId: string | null;
  metadata: BillingAlertMetadata;
};

export type BillingCapabilitiesMetadata = {
  subscriptionId: string;
  subscriptionStatus: string;
  cycleCount: number;
  eventCount: number;
  historyCount: number;
  calendarCount: number;
  alertCount: number;
  hasNextInvoice: boolean;
  failedEventCount: number;
  paymentEventCount: number;
  eventsWithInvoiceCount: number;
};

/**
 * Capacidades centralizadas do Aggregate (Sprint 5.0-20).
 * Snapshot determinístico — ainda não consumido pela UI.
 */
export type BillingCapabilitySnapshot = {
  canGenerate: boolean;
  canRetry: boolean;
  canCancel: boolean;
  canRefund: boolean;
  canPause: boolean;
  canResume: boolean;
  canReactivate: boolean;
  canDeleteInvoice: boolean;
  canOpenInvoice: boolean;
  canOpenSubscription: boolean;
  metadata: BillingCapabilitiesMetadata;
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
  /** `null` quando `events` está vazio — sem eventos virtuais. */
  nextInvoice: BillingNextInvoiceSnapshot | null;
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
