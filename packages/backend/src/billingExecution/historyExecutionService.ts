/**
 * Billing Engine V2 — Sprint 3.0D: persiste histórico padronizado de renovação.
 */
import { safeNowIso } from '../utils/billingSafeDate.js';
import {
  buildRenewalHistoryRecord,
  recordRenewalHistory,
} from '../services/renewalHistoryRecorder.js';
import type { BillingRenewalExecutionMode } from '../services/billingRenewalEngine/types.js';
import { logExecutionOrchestrator } from './orchestratorLogger.js';
import type { HistoryExecutionOutcome, NotificationExecutionOutcome } from './types.js';
import type { GatewayExecutionOutcome } from './types.js';

export async function executeRenewalHistory(params: {
  executionMode: BillingRenewalExecutionMode;
  subscriptionId: string;
  tenantId: string;
  jobId: string;
  invoiceId: string | null;
  cycleKey: string;
  correlationId: string;
  startedAt: string;
  success: boolean;
  result: string;
  gateway: GatewayExecutionOutcome;
  notification: NotificationExecutionOutcome;
}): Promise<HistoryExecutionOutcome> {
  logExecutionOrchestrator('HISTORY_EXECUTION', 'start', {
    subscription_id: params.subscriptionId,
    job_id: params.jobId,
  });

  try {
    await recordRenewalHistory(
      buildRenewalHistoryRecord({
        execution_mode: params.executionMode,
        subscription_id: params.subscriptionId,
        tenant_id: params.tenantId,
        job_id: params.jobId,
        invoice_id: params.invoiceId,
        cycle_key: params.cycleKey,
        correlation_id: params.correlationId,
        started_at: params.startedAt,
        finished_at: safeNowIso(),
        success: params.success,
        result: params.result,
        gateway_status: params.gateway.status,
        notification_status: params.notification.status,
        stage: 'persistence_orchestrator_v2',
      })
    );
    logExecutionOrchestrator('HISTORY_EXECUTION', 'complete', {
      subscription_id: params.subscriptionId,
    });
    return { status: 'ok' };
  } catch {
    logExecutionOrchestrator('HISTORY_EXECUTION', 'failed', {
      subscription_id: params.subscriptionId,
    });
    return { status: 'failed' };
  }
}
