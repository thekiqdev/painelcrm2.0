/**
 * Sprint 4.2D — Geração determinística de fatura por ciclo (`cycle_id`).
 * Sprint 5.0-23B — resolução de competência via OCRE.
 */
import { repairInvoicedCyclesWithoutInvoice } from './subscriptionCycleLifecycleService.js';
import { resolveCycleForManualGeneration } from './operationalCompetencyResolver.js';
import type { SubscriptionCycleDbRow } from './subscriptionCyclesQueryService.js';
import {
  manualGenerateRenewalNow,
  type ManualRenewalActionResult,
} from './billingManualRenewalService.js';
import { normalizeBillingCycleKeyYmd } from './recurringBillingJobService.js';
import { GENERATABLE_CYCLE_STATUSES } from './operationalCompetencyResolverCore.js';

type ActorContext = {
  user_id: string;
  user_name: string | null;
  ip: string | null;
};

export function validateCycleForInvoiceGeneration(cycle: SubscriptionCycleDbRow): string | null {
  if (cycle.invoice_id) {
    return 'Este ciclo já possui cobrança gerada.';
  }
  if (!GENERATABLE_CYCLE_STATUSES.has(cycle.status)) {
    if (cycle.status === 'invoiced') {
      return 'Este ciclo já foi faturado.';
    }
    if (cycle.status === 'processing') {
      return 'Este ciclo está em processamento.';
    }
    return `Ciclo não elegível para geração (status: ${cycle.status}).`;
  }
  const cycleKey = normalizeBillingCycleKeyYmd(cycle.cycle_date);
  if (!cycleKey) {
    return 'Data do ciclo inválida.';
  }
  return null;
}

/** @deprecated Sprint 5.0-23B — use resolveCycleForManualGeneration */
export async function resolveCycleIdForManualGeneration(
  tenantId: string,
  subscriptionId: string,
  cycleId?: string | null
): Promise<{ cycle: SubscriptionCycleDbRow } | { error: string; result: string }> {
  return resolveCycleForManualGeneration(tenantId, subscriptionId, cycleId);
}

/** Gera fatura exatamente para o ciclo resolvido pelo OCRE. */
export async function generateInvoiceForCycle(
  tenantId: string,
  subscriptionId: string,
  actor: ActorContext,
  cycleId?: string | null
): Promise<ManualRenewalActionResult> {
  await repairInvoicedCyclesWithoutInvoice(tenantId, subscriptionId, {
    reason: 'pre_manual_generate_invariant_repair',
    cycleId: cycleId ?? null,
  });

  const resolved = await resolveCycleForManualGeneration(tenantId, subscriptionId, cycleId);
  if ('error' in resolved) {
    return {
      success: false,
      job_id: null,
      invoice_id: null,
      invoice_number: null,
      gateway_status: null,
      notification_sent: false,
      subscription_status: null,
      cycle_key: null,
      execution_mode: 'manual',
      duration_ms: 0,
      message: resolved.error,
      result: resolved.result,
      error_code: resolved.result.toUpperCase(),
      stage: 'CYCLE_RESOLUTION',
      reason: resolved.result,
      repaired_fields: [],
      logs: [],
      correlation_id: `manual-cycle-${subscriptionId}-${Date.now()}`,
    };
  }

  const { cycle } = resolved;
  const validationError = validateCycleForInvoiceGeneration(cycle);
  if (validationError) {
    return {
      success: false,
      job_id: null,
      invoice_id: null,
      invoice_number: null,
      gateway_status: null,
      notification_sent: false,
      subscription_status: null,
      cycle_key: normalizeBillingCycleKeyYmd(cycle.cycle_date),
      execution_mode: 'manual',
      duration_ms: 0,
      message: validationError,
      result: 'cycle_not_generatable',
      error_code: 'CYCLE_NOT_GENERATABLE',
      stage: 'CYCLE_VALIDATION',
      reason: 'cycle_not_generatable',
      repaired_fields: [],
      logs: [],
      correlation_id: `manual-cycle-${subscriptionId}-${Date.now()}`,
    };
  }

  const cycleKey = normalizeBillingCycleKeyYmd(cycle.cycle_date) || cycle.cycle_date;
  return manualGenerateRenewalNow(tenantId, subscriptionId, actor, {
    cycleId: cycle.id,
    cycleKey,
    periodStart: cycle.period_start,
    periodEnd: cycle.period_end,
  });
}
