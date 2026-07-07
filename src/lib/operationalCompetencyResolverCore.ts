/**
 * Sprint 5.0-23B — algoritmo puro de resolução de competência operacional (OCRE).
 * Sem I/O; compartilhado entre backend e frontend.
 */

export const GENERATABLE_CYCLE_STATUSES = new Set([
  'pending',
  'queued',
  'failed',
  'skipped',
  'cancelled',
]);

export type OperationalCompetencyMode =
  | 'NEXT_GENERATE'
  | 'SPECIFIC_CYCLE'
  | 'REPROCESS'
  | 'DELETE_RECOVERY'
  | 'HISTORY'
  | 'CALENDAR'
  | 'NEXT_CARD';

export type OperationalCompetencyResolution =
  | 'READY_TO_GENERATE'
  | 'READY_TO_OPEN'
  | 'READY_TO_REPROCESS'
  | 'PROJECTION_ONLY'
  | 'WAITING_MATERIALIZATION'
  | 'NO_COMPETENCY'
  | 'SUBSCRIPTION_CANCELLED';

export type OperationalCycleInput = {
  id: string;
  cycle_date: string;
  period_start?: string;
  period_end?: string;
  status: string;
  invoice_id: string | null;
  job_id?: string | null;
};

export type OperationalCompetencyContext = {
  subscriptionId: string;
  subscriptionStatus: string;
  billingInterval: string;
  cycles: OperationalCycleInput[];
};

export type ResolveOperationalCompetencyParams = {
  subscriptionId: string;
  mode: OperationalCompetencyMode;
  preferredCycleId?: string | null;
  preferredDueDate?: string | null;
};

export type ResolvedOperationalCompetency = {
  cycleId: string | null;
  cycleDate: string | null;
  invoiceId: string | null;
  status: string | null;
  reason: string;
  source: string;
  resolution: OperationalCompetencyResolution;
  canGenerate: boolean;
  canOpen: boolean;
  canReprocess: boolean;
};

const MAX_CHRONOLOGY_STEPS = 480;

function canonicalYmd(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const ymd = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

function sortCycles(cycles: OperationalCycleInput[]): OperationalCycleInput[] {
  return [...cycles].sort(
    (a, b) => a.cycle_date.localeCompare(b.cycle_date) || a.id.localeCompare(b.id)
  );
}

function indexCyclesByDate(cycles: OperationalCycleInput[]): Map<string, OperationalCycleInput> {
  const byDate = new Map<string, OperationalCycleInput>();
  for (const cycle of sortCycles(cycles)) {
    const date = canonicalYmd(cycle.cycle_date);
    if (!date) continue;
    const existing = byDate.get(date);
    if (!existing || cycle.id.localeCompare(existing.id) < 0) {
      byDate.set(date, cycle);
    }
  }
  return byDate;
}

function isGeneratable(cycle: OperationalCycleInput): boolean {
  if (cycle.invoice_id) return false;
  return GENERATABLE_CYCLE_STATUSES.has(cycle.status.trim().toLowerCase());
}

function findCycleById(
  cycles: OperationalCycleInput[],
  cycleId: string | null | undefined
): OperationalCycleInput | null {
  if (!cycleId?.trim()) return null;
  return cycles.find((c) => c.id === cycleId.trim()) ?? null;
}

function findCycleByDueDate(
  cycles: OperationalCycleInput[],
  dueDate: string | null | undefined
): OperationalCycleInput | null {
  const due = canonicalYmd(dueDate);
  if (!due) return null;
  return cycles.find((c) => canonicalYmd(c.cycle_date) === due) ?? null;
}

function buildResult(
  partial: Partial<ResolvedOperationalCompetency> & Pick<ResolvedOperationalCompetency, 'resolution' | 'reason' | 'source'>
): ResolvedOperationalCompetency {
  return {
    cycleId: partial.cycleId ?? null,
    cycleDate: partial.cycleDate ?? null,
    invoiceId: partial.invoiceId ?? null,
    status: partial.status ?? null,
    reason: partial.reason,
    source: partial.source,
    resolution: partial.resolution,
    canGenerate: partial.canGenerate ?? false,
    canOpen: partial.canOpen ?? false,
    canReprocess: partial.canReprocess ?? false,
  };
}

function resolveSpecificCycle(
  cycle: OperationalCycleInput,
  mode: OperationalCompetencyMode
): ResolvedOperationalCompetency {
  const cycleDate = canonicalYmd(cycle.cycle_date);
  const status = cycle.status.trim().toLowerCase();
  const hasInvoice = Boolean(cycle.invoice_id);

  if (hasInvoice) {
    const failed = status === 'failed';
    return buildResult({
      cycleId: cycle.id,
      cycleDate,
      invoiceId: cycle.invoice_id,
      status: cycle.status,
      resolution: failed ? 'READY_TO_REPROCESS' : 'READY_TO_OPEN',
      reason: failed ? 'cycle_has_failed_invoice' : 'cycle_has_invoice',
      source: mode.toLowerCase(),
      canOpen: !failed,
      canReprocess: failed,
      canGenerate: false,
    });
  }

  if (isGeneratable(cycle)) {
    return buildResult({
      cycleId: cycle.id,
      cycleDate,
      invoiceId: null,
      status: cycle.status,
      resolution: 'READY_TO_GENERATE',
      reason: mode === 'DELETE_RECOVERY' ? 'deleted_invoice_recovery' : 'generatable_cycle',
      source: mode.toLowerCase(),
      canGenerate: true,
    });
  }

  if (status === 'processing') {
    return buildResult({
      cycleId: cycle.id,
      cycleDate,
      invoiceId: null,
      status: cycle.status,
      resolution: 'NO_COMPETENCY',
      reason: 'cycle_processing',
      source: mode.toLowerCase(),
    });
  }

  return buildResult({
    cycleId: cycle.id,
    cycleDate,
    invoiceId: cycle.invoice_id,
    status: cycle.status,
    resolution: 'NO_COMPETENCY',
    reason: 'cycle_not_operational',
    source: mode.toLowerCase(),
  });
}

export function resolveChronologicalOperationalCompetency(
  cycles: OperationalCycleInput[],
  advanceDue: (fromYmd: string) => string,
  source: string
): ResolvedOperationalCompetency {
  const sorted = sortCycles(cycles).filter((c) => canonicalYmd(c.cycle_date));
  if (sorted.length === 0) {
    return buildResult({
      resolution: 'PROJECTION_ONLY',
      reason: 'projection_only',
      source,
    });
  }

  const byDate = indexCyclesByDate(sorted);
  let cursor = canonicalYmd(sorted[0]!.cycle_date)!;

  for (let step = 0; step < MAX_CHRONOLOGY_STEPS; step++) {
    const atCursor = byDate.get(cursor);
    if (atCursor) {
      if (!atCursor.invoice_id && isGeneratable(atCursor)) {
        return resolveSpecificCycle(atCursor, 'NEXT_GENERATE');
      }
      cursor = canonicalYmd(advanceDue(atCursor.cycle_date)) ?? cursor;
      continue;
    }

    const nextPersisted = sorted.find((c) => canonicalYmd(c.cycle_date)! > cursor);
    if (nextPersisted) {
      return buildResult({
        cycleDate: cursor,
        resolution: 'WAITING_MATERIALIZATION',
        reason: 'competency_gap',
        source,
      });
    }
    break;
  }

  return buildResult({
    resolution: 'PROJECTION_ONLY',
    reason: 'projection_only',
    source,
  });
}

export function findFirstCompetencyGapDate(
  cycles: OperationalCycleInput[],
  advanceDue: (fromYmd: string) => string
): string | null {
  const resolved = resolveChronologicalOperationalCompetency(cycles, advanceDue, 'gap_probe');
  return resolved.resolution === 'WAITING_MATERIALIZATION' ? resolved.cycleDate : null;
}

export function resolveOperationalCompetencyFromContext(
  ctx: OperationalCompetencyContext,
  params: ResolveOperationalCompetencyParams,
  advanceDue: (fromYmd: string) => string
): ResolvedOperationalCompetency {
  if (ctx.subscriptionStatus === 'cancelled') {
    return buildResult({
      resolution: 'SUBSCRIPTION_CANCELLED',
      reason: 'subscription_cancelled',
      source: params.mode.toLowerCase(),
    });
  }

  const cycles = ctx.cycles ?? [];
  const source = params.mode.toLowerCase();

  const explicitCycle =
    findCycleById(cycles, params.preferredCycleId) ??
    findCycleByDueDate(cycles, params.preferredDueDate);

  if (explicitCycle && (params.preferredCycleId || params.preferredDueDate)) {
    if (params.mode === 'HISTORY' || params.mode === 'CALENDAR') {
      const next = resolveChronologicalOperationalCompetency(cycles, advanceDue, source);
      if (next.cycleId && next.cycleId === explicitCycle.id && next.canGenerate) {
        return { ...next, source };
      }
      if (next.cycleDate && !next.cycleId && canonicalYmd(explicitCycle.cycle_date) === next.cycleDate) {
        return { ...next, source };
      }
      const specific = resolveSpecificCycle(explicitCycle, params.mode);
      return buildResult({
        ...specific,
        canGenerate: false,
        resolution: specific.canOpen
          ? 'READY_TO_OPEN'
          : specific.canReprocess
            ? 'READY_TO_REPROCESS'
            : 'NO_COMPETENCY',
        reason:
          next.cycleId && next.cycleId !== explicitCycle.id
            ? 'not_next_operational_competency'
            : specific.reason,
        source,
      });
    }
    return resolveSpecificCycle(explicitCycle, params.mode);
  }

  if (params.mode === 'SPECIFIC_CYCLE' && (params.preferredCycleId || params.preferredDueDate)) {
    return buildResult({
      resolution: 'NO_COMPETENCY',
      reason: 'preferred_cycle_not_found',
      source,
    });
  }

  return resolveChronologicalOperationalCompetency(cycles, advanceDue, source);
}

export function canGenerateForCycleFromResolution(
  resolved: ResolvedOperationalCompetency,
  cycleId: string | null | undefined
): boolean {
  if (!cycleId?.trim()) return false;
  return resolved.canGenerate && resolved.cycleId === cycleId.trim();
}

export function cycleMatchesOperationalResolution(
  resolved: ResolvedOperationalCompetency,
  cycleId: string | null | undefined
): boolean {
  if (!cycleId?.trim()) return false;
  if (resolved.cycleId && resolved.cycleId === cycleId.trim()) return true;
  const cycle = canonicalYmd(cycleId);
  return Boolean(resolved.cycleDate && cycle && resolved.cycleDate === cycle);
}
