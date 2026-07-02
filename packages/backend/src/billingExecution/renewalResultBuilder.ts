/**
 * Billing Engine V2 — Sprint 3.0D: monta BillingRenewalResult compatível com Worker.
 */
import { BILLING_RECURRING_JOB_OUTCOME } from '../services/billingRecurringJobPersistence.js';
import type {
  BillingRenewalExecutionMode,
  BillingRenewalResult,
} from '../services/billingRenewalEngine/types.js';
import type {
  GatewayExecutionOutcome,
  HistoryExecutionOutcome,
  NotificationExecutionOutcome,
  SubscriptionAdvanceOutcome,
  TimelineExecutionOutcome,
} from './types.js';

export function buildBillingRenewalResult(params: {
  success: boolean;
  cancelled?: boolean;
  invoiceId: string | null;
  invoiceNumber?: string | null;
  executionMode: BillingRenewalExecutionMode;
  correlationId: string;
  cycleKey: string;
  executionTime: number;
  logs: string[];
  gateway: GatewayExecutionOutcome;
  notification: NotificationExecutionOutcome;
  timeline: TimelineExecutionOutcome;
  history: HistoryExecutionOutcome;
  subscription: SubscriptionAdvanceOutcome;
  idempotentReuse?: boolean;
  completionOutcome?: string | null;
}): BillingRenewalResult {
  const completionOutcome =
    params.completionOutcome ??
    (params.idempotentReuse
      ? BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER
      : params.success
        ? BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER
        : null);

  return {
    success: params.success,
    cancelled: params.cancelled,
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber ?? null,
    gatewayStatus: params.gateway.status,
    notificationStatus: params.notification.status,
    timelineStatus: params.timeline.status === 'ok' ? 'ok' : params.timeline.status === 'failed' ? 'failed' : 'skipped',
    historyStatus: params.history.status === 'ok' ? 'ok' : params.history.status === 'failed' ? 'failed' : 'skipped',
    subscriptionAdvanced: params.subscription.advanced,
    completionOutcome,
    executionTime: params.executionTime,
    logs: params.logs,
    cycleKey: params.cycleKey,
    executionMode: params.executionMode,
    correlationId: params.correlationId,
  };
}
