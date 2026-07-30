/**
 * Sprint 2 — resumo e regras de contrato de ciclos (UI).
 * Contagem = ciclos com invoice_id (emitidos), não só pagos.
 */
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';

export function countEmittedSubscriptionCycles(
  detail: Pick<CrmSubscriptionDetailPayload, 'cycles_raw'>
): number {
  return (detail.cycles_raw ?? []).filter((c) => Boolean(c.invoice_id?.trim())).length;
}

export type CyclesContractSummary = {
  emitted: number;
  max: number | null;
  unlimited: boolean;
  /** Ex.: "3 de 12" ou "3 / ∞" */
  label: string;
  floorMax: number;
};

export function buildCyclesContractSummary(
  detail: Pick<CrmSubscriptionDetailPayload, 'subscription' | 'cycles_raw'>
): CyclesContractSummary {
  const emitted = countEmittedSubscriptionCycles(detail);
  const unlimited = detail.subscription.cycles_unlimited !== false;
  const max =
    !unlimited && detail.subscription.max_cycles != null && detail.subscription.max_cycles >= 1
      ? Math.trunc(detail.subscription.max_cycles)
      : null;
  const floorMax = Math.max(emitted, 1);
  if (unlimited || max == null) {
    return {
      emitted,
      max: null,
      unlimited: true,
      label: `${emitted} / ∞`,
      floorMax,
    };
  }
  return {
    emitted,
    max,
    unlimited: false,
    label: `${emitted} de ${max}`,
    floorMax: Math.max(emitted, max, 1),
  };
}

/** Pode emitir nova cobrança? (false se completed/cancelled ou emitted >= max). */
export function subscriptionAllowsNewChargeGeneration(
  detail: Pick<CrmSubscriptionDetailPayload, 'subscription' | 'cycles_raw'>
): boolean {
  const status = detail.subscription.status;
  if (status === 'cancelled' || status === 'completed') return false;
  const summary = buildCyclesContractSummary(detail);
  if (summary.unlimited || summary.max == null) return true;
  return summary.emitted < summary.max;
}
