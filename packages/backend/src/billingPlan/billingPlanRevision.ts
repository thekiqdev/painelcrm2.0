/**
 * Billing Engine V2 — incremento de revision (ajustes menores na mesma version).
 */
import type { BillingPlanRow } from './types.js';

export function nextBillingPlanRevision(
  plans: Pick<BillingPlanRow, 'version' | 'plan_revision'>[],
  version: number
): number {
  const sameVersion = plans.filter((p) => p.version === version);
  if (sameVersion.length === 0) return 1;
  return Math.max(...sameVersion.map((p) => p.plan_revision)) + 1;
}

export function sortByVersionThenRevisionDesc(plans: BillingPlanRow[]): BillingPlanRow[] {
  return [...plans].sort((a, b) => {
    if (b.version !== a.version) return b.version - a.version;
    return b.plan_revision - a.plan_revision;
  });
}
