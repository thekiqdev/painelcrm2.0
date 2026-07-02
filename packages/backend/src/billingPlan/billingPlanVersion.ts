/**
 * Billing Engine V2 — versionamento de Billing Plan (Sprint 2.1).
 * Cada alteração futura cria nova versão; nunca muta versão anterior.
 */
import type { BillingPlanRow } from './types.js';

export function nextBillingPlanVersion(plans: Pick<BillingPlanRow, 'version'>[]): number {
  if (plans.length === 0) return 1;
  return Math.max(...plans.map((p) => p.version)) + 1;
}

export function sortBillingPlansByVersionDesc(
  plans: BillingPlanRow[]
): BillingPlanRow[] {
  return [...plans].sort((a, b) => b.version - a.version);
}

export function isBillingPlanVersionImmutable(
  existing: BillingPlanRow,
  proposedVersion: number
): boolean {
  return proposedVersion <= existing.version;
}
