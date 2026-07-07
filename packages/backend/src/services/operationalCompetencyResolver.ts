/**
 * Sprint 5.0-23B — Operational Competency Resolution Engine (OCRE).
 * Único algoritmo de escolha de competência financeira no backend.
 */
import { pool } from '../utils/db.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import type { BillingInterval } from './billingService.js';
import {
  listSubscriptionCyclesBySubscriptionId,
  getSubscriptionCycleById,
  type SubscriptionCycleDbRow,
} from './subscriptionCyclesQueryService.js';
import { getSubscriptionById } from './billingSubscriptionService.js';
import {
  materializePlannedCycles,
  planNextCompetenceFromInterval,
} from './subscriptionCyclePlanner.js';
import {
  resolveOperationalCompetencyFromContext,
  type OperationalCompetencyContext,
  type OperationalCompetencyMode,
  type ResolveOperationalCompetencyParams,
  type ResolvedOperationalCompetency,
} from './operationalCompetencyResolverCore.js';

export type {
  OperationalCompetencyMode,
  OperationalCompetencyResolution,
  ResolvedOperationalCompetency,
  ResolveOperationalCompetencyParams,
} from './operationalCompetencyResolverCore.js';

export {
  resolveOperationalCompetencyFromContext,
  findFirstCompetencyGapDate,
  canGenerateForCycleFromResolution,
  cycleMatchesOperationalResolution,
  GENERATABLE_CYCLE_STATUSES,
} from './operationalCompetencyResolverCore.js';

function mapDbCycles(rows: SubscriptionCycleDbRow[]): OperationalCompetencyContext['cycles'] {
  return rows.map((r) => ({
    id: r.id,
    cycle_date: r.cycle_date,
    period_start: r.period_start,
    period_end: r.period_end,
    status: r.status,
    invoice_id: r.invoice_id,
    job_id: r.job_id,
  }));
}

function advanceDue(interval: string): (fromYmd: string) => string {
  const billingInterval = (interval || 'monthly') as BillingInterval;
  return (fromYmd: string) => calculateNextBillingDate(fromYmd, billingInterval, null);
}

async function loadContext(
  tenantId: string,
  subscriptionId: string
): Promise<OperationalCompetencyContext | null> {
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub || sub.tenant_id !== tenantId) return null;
  const rows = await listSubscriptionCyclesBySubscriptionId(tenantId, subscriptionId, 120);
  return {
    subscriptionId,
    subscriptionStatus: sub.status,
    billingInterval: sub.billing_interval || 'monthly',
    cycles: mapDbCycles(rows),
  };
}

async function materializeGapIfNeeded(
  tenantId: string,
  ctx: OperationalCompetencyContext,
  resolved: ResolvedOperationalCompetency
): Promise<ResolvedOperationalCompetency> {
  if (resolved.resolution !== 'WAITING_MATERIALIZATION' || !resolved.cycleDate) {
    return resolved;
  }

  const sorted = [...ctx.cycles].sort((a, b) => a.cycle_date.localeCompare(b.cycle_date));
  const anchor = sorted.find((c) => c.cycle_date < resolved.cycleDate!) ?? sorted[sorted.length - 1];
  if (!anchor) return resolved;

  const plans = planNextCompetenceFromInterval(
    anchor.cycle_date,
    ctx.billingInterval,
    'runtime_repair'
  ).filter((p) => p.cycleDateYmd === resolved.cycleDate);

  if (plans.length === 0) {
    plans.push({ cycleDateYmd: resolved.cycleDate, source: 'runtime_repair' });
  }

  await materializePlannedCycles(pool, {
    tenantId,
    subscriptionId: ctx.subscriptionId,
    plans,
  });

  const rows = await listSubscriptionCyclesBySubscriptionId(tenantId, ctx.subscriptionId, 120);
  const materialized = rows.find((r) => r.cycle_date === resolved.cycleDate);
  if (!materialized) return resolved;

  return {
    ...resolved,
    cycleId: materialized.id,
    status: materialized.status,
    invoiceId: materialized.invoice_id,
    resolution: materialized.invoice_id ? 'READY_TO_OPEN' : 'READY_TO_GENERATE',
    reason: 'gap_materialized',
    source: 'materializer',
    canGenerate: !materialized.invoice_id,
    canOpen: Boolean(materialized.invoice_id),
  };
}

export type ResolveOperationalCompetencyOptions = ResolveOperationalCompetencyParams & {
  tenantId: string;
  /** Materializa gaps via Planner+Materializer (default true no backend). */
  materializeGaps?: boolean;
};

/**
 * Resolve competência operacional — porta única do domínio no backend.
 */
export async function resolveOperationalCompetency(
  options: ResolveOperationalCompetencyOptions
): Promise<ResolvedOperationalCompetency> {
  const { tenantId, subscriptionId, mode, preferredCycleId, preferredDueDate, materializeGaps = true } =
    options;

  const ctx = await loadContext(tenantId, subscriptionId);
  if (!ctx) {
    return {
      cycleId: null,
      cycleDate: null,
      invoiceId: null,
      status: null,
      reason: 'subscription_not_found',
      source: mode.toLowerCase(),
      resolution: 'NO_COMPETENCY',
      canGenerate: false,
      canOpen: false,
      canReprocess: false,
    };
  }

  let resolved = resolveOperationalCompetencyFromContext(
    ctx,
    { subscriptionId, mode, preferredCycleId, preferredDueDate },
    advanceDue(ctx.billingInterval)
  );

  if (materializeGaps && resolved.resolution === 'WAITING_MATERIALIZATION') {
    resolved = await materializeGapIfNeeded(tenantId, ctx, resolved);
  }

  return resolved;
}

/** Resolve ciclo para geração manual — substitui findEarliestUninvoicedCycle. */
export async function resolveCycleForManualGeneration(
  tenantId: string,
  subscriptionId: string,
  cycleId?: string | null
): Promise<{ cycle: SubscriptionCycleDbRow } | { error: string; result: string }> {
  if (cycleId?.trim()) {
    const cycle = await getSubscriptionCycleById(tenantId, subscriptionId, cycleId.trim());
    if (!cycle) {
      return { error: 'Ciclo não encontrado para esta assinatura.', result: 'cycle_not_found' };
    }
    const sub = await getSubscriptionById(subscriptionId);
    if (!sub || sub.tenant_id !== tenantId) {
      return { error: 'Assinatura não encontrada.', result: 'subscription_not_found' };
    }
    const ctx = await loadContext(tenantId, subscriptionId);
    if (!ctx) {
      return { error: 'Assinatura não encontrada.', result: 'subscription_not_found' };
    }
    const resolved = resolveOperationalCompetencyFromContext(
      ctx,
      { subscriptionId, mode: 'SPECIFIC_CYCLE', preferredCycleId: cycle.id },
      advanceDue(ctx.billingInterval)
    );
    if (!resolved.canGenerate && resolved.resolution !== 'READY_TO_GENERATE') {
      return { error: 'Ciclo não elegível para geração.', result: 'cycle_not_generatable' };
    }
    return { cycle };
  }

  const resolved = await resolveOperationalCompetency({
    tenantId,
    subscriptionId,
    mode: 'NEXT_GENERATE',
  });

  if (!resolved.cycleId) {
    return {
      error: 'Nenhum ciclo elegível encontrado. Informe cycle_id ou aguarde a criação do ciclo.',
      result: resolved.reason === 'projection_only' ? 'cycle_required' : 'cycle_required',
    };
  }

  const cycle = await getSubscriptionCycleById(tenantId, subscriptionId, resolved.cycleId);
  if (!cycle) {
    return { error: 'Ciclo resolvido não encontrado.', result: 'cycle_not_found' };
  }
  return { cycle };
}

/** Pós-delete invoice: garante competência operacional disponível. */
export async function resolveAfterInvoiceDelete(
  tenantId: string,
  subscriptionId: string,
  cycleId?: string | null
): Promise<ResolvedOperationalCompetency> {
  return resolveOperationalCompetency({
    tenantId,
    subscriptionId,
    mode: 'DELETE_RECOVERY',
    preferredCycleId: cycleId ?? null,
    materializeGaps: true,
  });
}
