/**
 * Sprint 4.2D/4.2E/4.2G — Geração determinística unificada (único fluxo; cycle_id obrigatório).
 */
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import {
  crmSubscriptionsService,
  type CrmSubscriptionManualRenewalResult,
} from '@/services/crmSubscriptions';
import { resolveOperationalCompetency } from './operationalCompetencyResolver';
import { findCycleById } from './subscriptionCyclesSource';

/** Alvo determinístico para geração manual de cobrança. */
export type GenerateBillingTarget = {
  cycleId: string;
  dueYmd?: string | null;
  rowId?: string;
  componentName?: string;
};

export function resolveGenerateBillingCycleId(
  target?: Partial<GenerateBillingTarget> | null,
  fallbackCycleId?: string | null
): string | undefined {
  const id = target?.cycleId?.trim() || fallbackCycleId?.trim();
  return id || undefined;
}

export function logDeterministicGenerateClick(
  componentName: string,
  subscriptionId: string,
  target: GenerateBillingTarget,
  payload: { cycle_id: string }
): void {
  if (!import.meta.env.DEV) return;
  console.log(
    '[BILLING_DETERMINISTIC_GENERATE]',
    JSON.stringify({
      component_name: componentName,
      subscription_id: subscriptionId,
      cycle_id: payload.cycle_id,
      cycle_date: target.dueYmd ?? null,
      invoice_id: null,
      payload,
    })
  );
}

/** Único ponto de chamada à API de geração manual. Exige cycle_id — sem fallback. */
export async function executeDeterministicGenerateRenewal(params: {
  subscriptionId: string;
  detail: CrmSubscriptionDetailPayload;
  target?: Partial<GenerateBillingTarget> | null;
  rowCycleId?: string | null;
  componentName: string;
}): Promise<CrmSubscriptionManualRenewalResult> {
  const cycleId = resolveGenerateBillingCycleId(params.target, params.rowCycleId);
  if (!cycleId) {
    const message = 'cycle_id é obrigatório — competência deve existir em subscription_cycles.';
    if (import.meta.env.DEV) {
      console.error('[BILLING_DETERMINISTIC_GENERATE] blocked', {
        component: params.componentName,
        subscription_id: params.subscriptionId,
      });
    }
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
      message,
      result: 'cycle_id_required',
      error_code: 'CYCLE_ID_REQUIRED',
      stage: 'CYCLE_RESOLUTION',
      reason: 'cycle_id_required',
      repaired_fields: [],
      logs: [],
      correlation_id: `manual-cycle-${params.subscriptionId}-${Date.now()}`,
    };
  }

  const cycle = findCycleById(params.detail, cycleId);
  const payload = { cycle_id: cycleId };
  logDeterministicGenerateClick(
    params.componentName,
    params.subscriptionId,
    {
      cycleId,
      dueYmd: cycle?.cycle_date ?? params.target?.dueYmd ?? null,
      componentName: params.componentName,
    },
    payload
  );

  return crmSubscriptionsService.generateRenewalNow(params.subscriptionId, { cycleId });
}
