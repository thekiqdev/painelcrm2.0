/**
 * Sprint 5.0-23A — decide quais competências precisam existir (read-only).
 * Não escreve banco, não cria jobs nem invoices.
 */
import {
  normalizeBillingCycleKeyYmd,
  normalizeSubscriptionNextBillingYmd,
} from '../utils/billingCycleKey.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import type { BillingInterval } from './billingService.js';
import {
  ensureSubscriptionCycle,
  type DbQueryable,
  type SubscriptionCycleMaterializeSource,
} from './subscriptionCycleMaterializer.js';

export type PlannedSubscriptionCycle = {
  cycleDateYmd: string;
  source: SubscriptionCycleMaterializeSource;
};

function canonicalCycleYmd(raw: string): string | null {
  const ymd =
    normalizeBillingCycleKeyYmd(raw) || normalizeSubscriptionNextBillingYmd(raw) || raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/** Scheduler / tryEnqueue: competência elegível = next_billing_date atual. */
export function planSchedulerEligibleCycle(nextBillingDateYmd: string): PlannedSubscriptionCycle[] {
  const cycle = canonicalCycleYmd(nextBillingDateYmd);
  if (!cycle) return [];
  return [{ cycleDateYmd: cycle, source: 'scheduler' }];
}

/** Manual Generate: competência corrente (+ opcional próxima após avanço). */
export function planManualGenerateCycles(
  currentCycleYmd: string,
  nextBillingDateYmd?: string | null
): PlannedSubscriptionCycle[] {
  const current = canonicalCycleYmd(currentCycleYmd);
  if (!current) return [];
  const plans: PlannedSubscriptionCycle[] = [
    { cycleDateYmd: current, source: 'manual_generate' },
  ];
  if (nextBillingDateYmd) {
    const next = canonicalCycleYmd(nextBillingDateYmd);
    if (next && next !== current) {
      plans.push({ cycleDateYmd: next, source: 'manual_generate' });
    }
  }
  return plans;
}

/** PATCH next_billing_date: nova competência alvo. */
export function planPatchNextBilling(nextBillingDateYmd: string): PlannedSubscriptionCycle[] {
  const cycle = canonicalCycleYmd(nextBillingDateYmd);
  if (!cycle) return [];
  return [{ cycleDateYmd: cycle, source: 'patch_next_billing' }];
}

/** Resume / Reactivate: competência corrente após retomada. */
export function planResumeCycle(nextBillingDateYmd: string): PlannedSubscriptionCycle[] {
  const cycle = canonicalCycleYmd(nextBillingDateYmd);
  if (!cycle) return [];
  return [{ cycleDateYmd: cycle, source: 'resume' }];
}

/** Extensibilidade: próxima competência a partir do intervalo da assinatura. */
export function planNextCompetenceFromInterval(
  currentCycleYmd: string,
  billingInterval: string,
  source: SubscriptionCycleMaterializeSource = 'manual_generate'
): PlannedSubscriptionCycle[] {
  const current = canonicalCycleYmd(currentCycleYmd);
  if (!current) return [];
  const next = calculateNextBillingDate(current, (billingInterval || 'monthly') as BillingInterval, null);
  const nextYmd = canonicalCycleYmd(next);
  if (!nextYmd || nextYmd === current) return [];
  return [{ cycleDateYmd: nextYmd, source }];
}

export async function materializePlannedCycles(
  db: DbQueryable,
  params: {
    tenantId: string;
    subscriptionId: string;
    plans: PlannedSubscriptionCycle[];
    jobId?: string | null;
    schedulingMeta?: Record<string, unknown> | null;
  }
): Promise<void> {
  for (const plan of params.plans) {
    await ensureSubscriptionCycle(db, {
      tenantId: params.tenantId,
      subscriptionId: params.subscriptionId,
      cycleDateYmd: plan.cycleDateYmd,
      source: plan.source,
      jobId: params.jobId ?? null,
      schedulingMeta: params.schedulingMeta,
    });
  }
}
