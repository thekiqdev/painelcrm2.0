/**
 * Billing Engine 3.0 — motor oficial de geração de faturas CRM (isolado — sem Worker/Scheduler).
 *
 * Gera CustomerInvoiceDraft exclusivamente a partir de Billing Plan + Billing Items.
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import {
  assertProductionBillingContext,
  collectProductionWarnings,
} from './billingEngineContextGuard.js';
import { runBillingEnginePipeline, computeEngineProjectionHash } from './billingEnginePipeline.js';
import {
  buildCustomerInvoiceDraft,
  buildCustomerInvoiceItemDrafts,
} from './billingInvoiceBuilder.js';
import { buildBillingNotificationPayloads } from './billingNotificationBuilder.js';
import { logBillingEngine } from './engineLogger.js';
import type { BillingEngineInput, BillingEngineResult } from './types.js';
import { BILLING_ENGINE_VERSION } from './types.js';

export class BillingEngine {
  /**
   * Executa o Billing Engine a partir de BillingExecutionContext pré-montado.
   * Não persiste, não chama gateway, não enfileira notificações.
   */
  static execute(input: BillingEngineInput): BillingEngineResult {
    const started = Date.now();
    const { context } = input;
    const logBase = {
      tenant_id: context.subscription.tenant_id,
      subscription_id: context.subscription.id,
      correlation_id: context.metadata.correlation_id ?? undefined,
    };

    logBillingEngine('start', logBase);

    assertProductionBillingContext(context);

    const warnings = collectProductionWarnings(context);
    const errors = [...context.diagnostics.errors];

    const pipeline = runBillingEnginePipeline(context);
    const projectionHash = computeEngineProjectionHash(context, pipeline);

    const invoice = buildCustomerInvoiceDraft(context, pipeline.totals);
    const items = buildCustomerInvoiceItemDrafts(pipeline.taxed);
    const notifications = buildBillingNotificationPayloads(context, pipeline.totals.grandTotal);

    const durationMs = Date.now() - started;
    const approved = errors.length === 0 && items.length > 0;

    const result: BillingEngineResult = {
      invoice,
      items,
      gateway: pipeline.gateway,
      notifications,
      timeline: pipeline.timeline,
      history: pipeline.history,
      diagnostics: {
        ...context.diagnostics,
        engine_version: BILLING_ENGINE_VERSION,
        plan_source: context.metadata.plan_source,
        projection_hash: projectionHash,
        duration_ms: durationMs,
        warnings,
        errors,
      },
      approved,
    };

    logBillingEngine('complete', {
      ...logBase,
      duration_ms: durationMs,
      approved,
    });

    return result;
  }
}

export function getBillingEngineVersion(): string {
  return BILLING_ENGINE_VERSION;
}
