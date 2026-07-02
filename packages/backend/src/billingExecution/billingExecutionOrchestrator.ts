/**
 * Billing Engine V2 — Sprint 3.0D: orquestra persistência operacional pós-engine.
 */
import { BillingEngine } from '../billingEngine/billingEngine.js';
import type { CustomerInvoiceRow } from '../services/customerInvoiceService.js';
import { findCustomerInvoiceBySubscriptionAndPeriod } from '../services/customerInvoiceService.js';
import { BILLING_RECURRING_JOB_OUTCOME } from '../services/billingRecurringJobPersistence.js';
import { safeNowIso } from '../utils/billingSafeDate.js';
import { executeGatewayChargeForInvoice } from './gatewayExecutionService.js';
import { executeRenewalHistory } from './historyExecutionService.js';
import { persistCustomerInvoiceItemsFromDrafts } from './invoiceItemPersistenceService.js';
import {
  persistCustomerInvoiceFromDraft,
  rollbackPersistedInvoice,
} from './invoicePersistenceService.js';
import { executeInvoiceNotifications } from './notificationExecutionService.js';
import { logExecutionOrchestrator } from './orchestratorLogger.js';
import { buildBillingRenewalResult } from './renewalResultBuilder.js';
import { advanceSubscriptionCycle } from './subscriptionCycleService.js';
import { executeTimelineEvents } from './timelineExecutionService.js';
import {
  BillingExecutionOrchestratorError,
  EXECUTION_ORCHESTRATOR_VERSION,
  type BillingExecutionOrchestratorInput,
  type BillingExecutionStageResult,
} from './types.js';

export class BillingExecutionOrchestrator {
  /**
   * Executa BillingEngine + persistência operacional completa.
   * Não altera Worker nem BillingRenewalEngine V1.
   */
  static async execute(
    input: BillingExecutionOrchestratorInput
  ): Promise<BillingExecutionStageResult> {
    const started = Date.now();
    const startedAt = safeNowIso();
    const logs: string[] = ['persistence_orchestrator_start'];
    const { context, client, job, executionMode, periodStartYmd } = input;
    const correlationId =
      input.correlationId ??
      `persistence-v2-${job.id}-${context.subscription.id}`;

    logExecutionOrchestrator('EXECUTION_ORCHESTRATOR', 'start', {
      subscription_id: context.subscription.id,
      job_id: job.id,
      correlation_id: correlationId,
      engine_version: EXECUTION_ORCHESTRATOR_VERSION,
    });

    const existing = await findCustomerInvoiceBySubscriptionAndPeriod(
      context.subscription.id,
      periodStartYmd
    );

    if (existing) {
      logs.push('idempotent_existing_invoice');
      const renewal = buildBillingRenewalResult({
        success: true,
        invoiceId: existing.id,
        invoiceNumber: existing.invoice_number,
        executionMode,
        correlationId,
        cycleKey: periodStartYmd,
        executionTime: Date.now() - started,
        logs,
        gateway: { status: existing.gateway_status, paymentId: existing.gateway_reference_id, failed: false },
        notification: { status: 'skipped' },
        timeline: { status: 'skipped', eventsRecorded: 0 },
        history: { status: 'skipped' },
        subscription: { advanced: false },
        idempotentReuse: true,
        completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_IDEMPOTENT_CUSTOMER,
      });

      logExecutionOrchestrator('ORCHESTRATOR_RESULT', 'idempotent', {
        subscription_id: context.subscription.id,
        invoice_id: existing.id,
      });

      return {
        engine: null,
        persisted: { invoice: existing, itemCount: 0, idempotentReuse: true },
        gateway: { status: existing.gateway_status, paymentId: existing.gateway_reference_id, failed: false },
        notification: { status: 'skipped' },
        timeline: { status: 'skipped', eventsRecorded: 0 },
        history: { status: 'skipped' },
        subscription: { advanced: false },
        renewal,
      };
    }

    const engine = BillingEngine.execute({ context });
    logs.push('engine_v2_complete');

    if (!engine.approved || engine.items.length === 0) {
      throw new BillingExecutionOrchestratorError(
        'BillingEngine não aprovou a renovação',
        'ENGINE_NOT_APPROVED',
        'ENGINE'
      );
    }

    let invoiceRow: CustomerInvoiceRow | undefined;
    try {
      invoiceRow = await persistCustomerInvoiceFromDraft(client, engine.invoice);
      logs.push('invoice_persisted');

      await persistCustomerInvoiceItemsFromDrafts(client, {
        invoiceId: invoiceRow.id,
        items: engine.items,
        scheduledDueDate: engine.invoice.due_date,
      });
      logs.push('items_persisted');
    } catch (err) {
      if (invoiceRow) {
        await rollbackPersistedInvoice(client, invoiceRow.id, engine.invoice.tenant_id);
        logs.push('rollback_invoice');
      }
      throw err;
    }

    const notification = executeInvoiceNotifications({
      tenantId: engine.invoice.tenant_id,
      invoiceId: invoiceRow.id,
    });
    logs.push(`notification_${notification.status}`);

    const gateway = await executeGatewayChargeForInvoice(client, {
      context,
      draft: engine.invoice,
      invoiceId: invoiceRow.id,
      invoiceNumber: invoiceRow.invoice_number,
      periodStartYmd,
    });
    logs.push(gateway.failed ? 'gateway_failed' : 'gateway_complete');

    const timeline = await executeTimelineEvents({
      subscriptionId: context.subscription.id,
      tenantId: context.subscription.tenant_id,
      invoiceId: invoiceRow.id,
      cycleKey: periodStartYmd,
      correlationId,
      events: engine.timeline,
    });
    logs.push(`timeline_${timeline.status}`);

    const subscription = await advanceSubscriptionCycle(client, {
      jobId: job.id,
      subscriptionId: context.subscription.id,
      tenantId: context.subscription.tenant_id,
      periodStartYmd,
      invoiceId: invoiceRow.id,
    });
    logs.push('subscription_advanced');

    const history = await executeRenewalHistory({
      executionMode,
      subscriptionId: context.subscription.id,
      tenantId: context.subscription.tenant_id,
      jobId: job.id,
      invoiceId: invoiceRow.id,
      cycleKey: periodStartYmd,
      correlationId,
      startedAt,
      success: true,
      result: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_CUSTOMER,
      gateway,
      notification,
    });
    logs.push(`history_${history.status}`);

    const renewal = buildBillingRenewalResult({
      success: true,
      invoiceId: invoiceRow.id,
      invoiceNumber: invoiceRow.invoice_number,
      executionMode,
      correlationId,
      cycleKey: periodStartYmd,
      executionTime: Date.now() - started,
      logs,
      gateway,
      notification,
      timeline,
      history,
      subscription,
    });

    logExecutionOrchestrator('ORCHESTRATOR_RESULT', 'complete', {
      subscription_id: context.subscription.id,
      invoice_id: invoiceRow.id,
      duration_ms: renewal.executionTime,
      gateway_status: renewal.gatewayStatus ?? undefined,
    });

    return {
      engine,
      persisted: { invoice: invoiceRow, itemCount: engine.items.length, idempotentReuse: false },
      gateway,
      notification,
      timeline,
      history,
      subscription,
      renewal,
    };
  }
}

export function getExecutionOrchestratorVersion(): string {
  return EXECUTION_ORCHESTRATOR_VERSION;
}
