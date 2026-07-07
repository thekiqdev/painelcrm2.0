/**
 * Sprint 5.0-23C — apresentação unificada de competência operacional para a UI.
 */
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { FinancialBadgeVariant } from './financialStatusBadge';
import type { InvoiceActionId } from './invoiceAvailableActions';
import { advanceBillingDueYmd } from './billingSubscriptionExperience';
import { billingStatusBadge, billingStatusLabel } from './billingStatusPresentation';
import {
  resolveOperationalCompetencyFromContext,
  type OperationalCompetencyMode,
  type OperationalCompetencyResolution,
  type ResolveOperationalCompetencyParams,
} from './operationalCompetencyResolverCore';
import { findCycleById } from './subscriptionCyclesSource';

/** Sprint 5.0-23F — única regra de visibilidade Gerar/Abrir na UI (exceto assinatura cancelada). */
export function invoiceVisibilityFromCycle(
  invoiceId: string | null | undefined,
  subscriptionStatus: string
): { canGenerate: boolean; canOpen: boolean } {
  if (subscriptionStatus === 'cancelled') {
    return { canGenerate: false, canOpen: false };
  }
  const inv = invoiceId?.trim() || null;
  if (inv) return { canGenerate: false, canOpen: true };
  return { canGenerate: true, canOpen: false };
}

/** Sprint 5.0-24D — INV-19 violado: invoiced sem invoice_id (legado ou delete incompleto). */
export function cycleNeedsInvariantRepair(
  cycleStatus: string | null | undefined,
  invoiceId: string | null | undefined
): boolean {
  return (cycleStatus ?? '').trim().toLowerCase() === 'invoiced' && !(invoiceId?.trim());
}

export type ResolvedCompetencyPresentation = {
  cycleId: string | null;
  dueDate: string | null;
  invoiceId: string | null;
  status: string | null;
  statusLabel: string;
  reason: string;
  source: string;
  resolution: OperationalCompetencyResolution;
  canGenerate: boolean;
  canOpen: boolean;
  canPay: boolean;
  canReprocess: boolean;
  badge: FinancialBadgeVariant;
  actions: InvoiceActionId[];
  isProjected: boolean;
  subscriptionId: string;
  /** Sprint 5.0-24D — ciclo invoiced sem invoice (precisa repair antes de gerar). */
  needsInvariantRepair: boolean;
};

function contextFromDetail(detail: CrmSubscriptionDetailPayload) {
  return {
    subscriptionId: detail.subscription.id,
    subscriptionStatus: detail.subscription.status,
    billingInterval: detail.subscription.billing_interval,
    cycles: (detail.cycles_raw ?? []).map((c) => ({
      id: c.id,
      cycle_date: c.cycle_date,
      period_start: c.period_start,
      period_end: c.period_end,
      status: c.status,
      invoice_id: c.invoice_id,
      job_id: c.job_id,
    })),
  };
}

function actionsFromResolution(
  resolved: ReturnType<typeof resolveOperationalCompetencyFromContext>
): InvoiceActionId[] {
  const actions: InvoiceActionId[] = [];
  if (resolved.canGenerate) actions.push('generate_now');
  if (resolved.canOpen) actions.push('open');
  if (resolved.canReprocess) actions.push('reprocess');
  return actions;
}

const INVOICE_ACTION_UI_MODES = new Set<OperationalCompetencyMode>([
  'HISTORY',
  'CALENDAR',
  'NEXT_CARD',
]);

function invoiceBasedCycleActions(
  cycle: { invoice_id: string | null; status?: string } | null | undefined,
  subscriptionStatus: string
): { canGenerate: boolean; canOpen: boolean; canReprocess: boolean; needsInvariantRepair: boolean } | null {
  if (!cycle) return null;
  if (cycleNeedsInvariantRepair(cycle.status, cycle.invoice_id)) {
    return { canGenerate: false, canOpen: false, canReprocess: false, needsInvariantRepair: true };
  }
  const vis = invoiceVisibilityFromCycle(cycle.invoice_id, subscriptionStatus);
  return { ...vis, canReprocess: false, needsInvariantRepair: false };
}

export function buildResolvedCompetencyPresentation(
  detail: CrmSubscriptionDetailPayload,
  params: Omit<ResolveOperationalCompetencyParams, 'subscriptionId'>,
  options?: {
    cycleStatus?: string | null;
    invoiceStatus?: string | null;
    eventType?: import('./financialEventTypes').FinancialEventType | null;
    overdue?: boolean;
  }
): ResolvedCompetencyPresentation {
  const ctx = contextFromDetail(detail);
  const resolved = resolveOperationalCompetencyFromContext(
    ctx,
    { ...params, subscriptionId: ctx.subscriptionId },
    (fromYmd) => advanceBillingDueYmd(fromYmd, detail.subscription.billing_interval)
  );

  const cycle =
    findCycleById(detail, resolved.cycleId) ??
    findCycleById(detail, params.preferredCycleId);
  const dueDate =
    resolved.cycleDate ??
    (cycle ? cycle.cycle_date : null) ??
    (params.preferredDueDate ?? null);

  const statusLabel = billingStatusLabel({
    cycleStatus: options?.cycleStatus ?? cycle?.status ?? resolved.status,
    invoiceStatus: options?.invoiceStatus,
    eventType: options?.eventType,
    resolution: resolved.resolution,
    overdue: options?.overdue,
    isProjected: resolved.resolution === 'PROJECTION_ONLY',
  });

  const badge = billingStatusBadge({
    cycleStatus: cycle?.status ?? resolved.status,
    invoiceStatus: options?.invoiceStatus,
    eventType: options?.eventType,
    resolution: resolved.resolution,
    overdue: options?.overdue,
    isProjected: resolved.resolution === 'PROJECTION_ONLY',
  });

  const invoiceActions =
    INVOICE_ACTION_UI_MODES.has(params.mode) && cycle
      ? invoiceBasedCycleActions(cycle, detail.subscription.status)
      : null;

  const canGenerate = invoiceActions?.canGenerate ?? resolved.canGenerate;
  const canOpen = invoiceActions?.canOpen ?? resolved.canOpen;
  const canReprocess = invoiceActions?.canReprocess ?? resolved.canReprocess;
  const needsInvariantRepair = invoiceActions?.needsInvariantRepair ?? false;
  const presentationResolved = {
    ...resolved,
    canGenerate,
    canOpen,
    canReprocess,
  };

  return {
    cycleId: resolved.cycleId ?? cycle?.id ?? null,
    dueDate,
    invoiceId: cycle?.invoice_id ?? resolved.invoiceId ?? null,
    status: resolved.status ?? cycle?.status ?? null,
    statusLabel,
    reason: resolved.reason,
    source: resolved.source,
    resolution: resolved.resolution,
    canGenerate,
    canOpen,
    canPay: Boolean(canOpen && options?.invoiceStatus !== 'paid'),
    canReprocess,
    badge,
    actions: actionsFromResolution(presentationResolved),
    isProjected: resolved.resolution === 'PROJECTION_ONLY',
    subscriptionId: ctx.subscriptionId,
    needsInvariantRepair,
  };
}

export function resolveCyclePresentation(
  detail: CrmSubscriptionDetailPayload,
  cycleId: string | null | undefined,
  mode: OperationalCompetencyMode = 'HISTORY',
  options?: Parameters<typeof buildResolvedCompetencyPresentation>[2]
): ResolvedCompetencyPresentation {
  return buildResolvedCompetencyPresentation(
    detail,
    { mode, preferredCycleId: cycleId ?? undefined },
    options
  );
}
