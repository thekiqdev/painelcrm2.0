/**
 * Billing Engine V2 — Sprint 3.0D: avança ciclo da assinatura após renovação.
 */
import { advanceSubscriptionAfterCompletedCycle } from '../services/billingRecurringJobPersistence.js';
import { logExecutionOrchestrator } from './orchestratorLogger.js';
import type { DbQueryable, SubscriptionAdvanceOutcome } from './types.js';

export async function advanceSubscriptionCycle(
  db: DbQueryable,
  params: {
    jobId: string;
    subscriptionId: string;
    tenantId: string;
    periodStartYmd: string;
    invoiceId: string;
  }
): Promise<SubscriptionAdvanceOutcome> {
  logExecutionOrchestrator('SUBSCRIPTION_ADVANCE', 'start', {
    subscription_id: params.subscriptionId,
    job_id: params.jobId,
    cycle_key: params.periodStartYmd,
  });

  await advanceSubscriptionAfterCompletedCycle(db, {
    jobId: params.jobId,
    subscriptionId: params.subscriptionId,
    tenantId: params.tenantId,
    cycleDateYmd: params.periodStartYmd,
    source: 'crm_new_invoice',
    resultInvoiceId: params.invoiceId,
  });

  logExecutionOrchestrator('SUBSCRIPTION_ADVANCE', 'complete', {
    subscription_id: params.subscriptionId,
    invoice_id: params.invoiceId,
  });

  return { advanced: true };
}
