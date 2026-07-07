/**
 * Sprint 4.2C — Máquina oficial de estados do Billing (Runtime / UX).
 * Única fonte para Calendário, Histórico, Sidebar e Próxima Cobrança.
 */
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import type { FinancialEvent, FinancialEventType } from './financialEventTypes';
import type { FinancialHistoryRow, CalendarVisualKind } from './billingSubscriptionExperience';
import { normalizeYmdInput } from './billingSubscriptionExperience';
import { isRecoverableCycleFailure } from './subscriptionRenewalRecovery';

export type BillingCycleState =
  | 'awaiting_generation'
  | 'pending_invoice'
  | 'paid'
  | 'cancelled'
  | 'refunded'
  | 'failed'
  | 'processing'
  | 'unknown';

export type BillingCycleStateResult = {
  state: BillingCycleState;
  label: string;
  canGenerate: boolean;
  isFuture: boolean;
};

export type BillingCycleStateInput = {
  cycleStatus?: string | null;
  operationalState?: string | null;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  skippedReason?: string | null;
  subscriptionStatus: string;
  dueYmd?: string | null;
  todayYmd: string;
  paidAt?: string | null;
};

export const OFFICIAL_CYCLE_CANCEL_MARKERS = [
  'cancel_subscription',
  'cancel_invoice',
  'cancel_cycle',
  'subscription_cancelled',
  'manual_cancel',
  'billing.cancel_invoice',
  'billing.cancel_subscription',
  'billing.cancel_charge',
] as const;

export const SKIPPED_RECOVERABLE_REASONS = [
  'completed_no_invoice_no_eligible_items',
  'completed_no_invoice',
] as const;

const INVALID_YMD_RE = /NaN/i;

export function isValidBillingYmd(value: unknown): value is string {
  if (value == null || value === '') return false;
  const ymd = normalizeBillingDate(value);
  return ymd != null && !INVALID_YMD_RE.test(ymd);
}

/** Normaliza data civil; rejeita NaN-NaN-NaN e Invalid Date. */
export function normalizeBillingDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const ymd = value.toISOString().slice(0, 10);
    return INVALID_YMD_RE.test(ymd) ? null : ymd;
  }
  const s = String(value).trim();
  if (!s || INVALID_YMD_RE.test(s)) return null;
  const ymd = normalizeYmdInput(s);
  if (!ymd || INVALID_YMD_RE.test(ymd)) return null;
  return ymd;
}

export function hasOfficialCycleCancellation(input: {
  skippedReason?: string | null;
  subscriptionStatus: string;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
}): boolean {
  if ((input.subscriptionStatus ?? '').toLowerCase() === 'cancelled') return true;
  const invSt = (input.invoiceStatus ?? '').toLowerCase();
  if (input.invoiceId && invSt === 'cancelled') return true;
  const reason = (input.skippedReason ?? '').toLowerCase().trim();
  if (!reason) return false;
  return OFFICIAL_CYCLE_CANCEL_MARKERS.some((m) => reason.includes(m.toLowerCase()));
}

export function isSkippedRecoverable(skippedReason?: string | null): boolean {
  const reason = (skippedReason ?? '').toLowerCase();
  return SKIPPED_RECOVERABLE_REASONS.some((r) => reason.includes(r));
}

export function isLegacyFalseCancelled(input: BillingCycleStateInput): boolean {
  const cycle = (input.cycleStatus ?? '').toLowerCase();
  const op = (input.operationalState ?? '').toLowerCase();
  const isCancelled = cycle === 'cancelled' || op === 'cancelled';
  if (!isCancelled || input.invoiceId) return false;
  if ((input.subscriptionStatus ?? '').toLowerCase() === 'cancelled') return false;
  return !hasOfficialCycleCancellation(input);
}

export function timelineRowToStateInput(
  row: CrmSubscriptionTimelineRow,
  subscriptionStatus: string,
  todayYmd: string
): BillingCycleStateInput {
  const due =
    normalizeBillingDate(row.due_date) ?? normalizeBillingDate(row.cycle_date);
  return {
    cycleStatus: row.cycle_status,
    operationalState: row.operational_state,
    invoiceId: row.invoice_id,
    invoiceStatus: row.invoice_status,
    skippedReason: row.cycle_skipped_reason ?? null,
    subscriptionStatus,
    dueYmd: due,
    todayYmd,
    paidAt: row.invoice_status === 'paid' ? due : null,
  };
}

export function resolveBillingCycleState(input: BillingCycleStateInput): BillingCycleStateResult {
  const sub = (input.subscriptionStatus ?? '').toLowerCase();
  const subActive = sub === 'active' || sub === 'paused' || sub === 'past_due' || sub === 'trialing';
  const invStatus = (input.invoiceStatus ?? '').toLowerCase();
  const due = normalizeBillingDate(input.dueYmd);
  const isFuture = Boolean(due && due >= input.todayYmd);

  if (input.invoiceId) {
    if (invStatus === 'paid' || input.paidAt) {
      return { state: 'paid', label: 'Pago', canGenerate: false, isFuture };
    }
    if (invStatus === 'refunded' || invStatus === 'chargeback') {
      return { state: 'refunded', label: 'Reembolsada', canGenerate: false, isFuture };
    }
    if (invStatus === 'cancelled') {
      return { state: 'cancelled', label: 'Cancelada', canGenerate: false, isFuture };
    }
    return { state: 'pending_invoice', label: 'Pendente', canGenerate: false, isFuture };
  }

  if (sub === 'cancelled') {
    return { state: 'cancelled', label: 'Cancelada', canGenerate: false, isFuture };
  }

  const cycle = (input.cycleStatus ?? '').toLowerCase();
  const op = (input.operationalState ?? '').toLowerCase();

  if (
    (cycle === 'failed' || op === 'failed') &&
    !isRecoverableCycleFailure(
      {
        operational_state: op as CrmSubscriptionTimelineRow['operational_state'],
        invoice_id: null,
        due_date: due,
        cycle_date: due,
        cycle_status: cycle,
      },
      input.todayYmd
    )
  ) {
    return { state: 'failed', label: 'Falhou', canGenerate: false, isFuture };
  }

  if (cycle === 'processing' || op === 'processing') {
    return { state: 'processing', label: 'Processando', canGenerate: false, isFuture };
  }

  const skippedRecoverable =
    (cycle === 'skipped' || op === 'skipped') &&
    (isSkippedRecoverable(input.skippedReason) || subActive);

  const legacyCancelled = isLegacyFalseCancelled(input);
  const pendingLike =
    cycle === 'pending' ||
    op === 'awaiting_generation' ||
    op === 'scheduled' ||
    op === 'in_queue' ||
    legacyCancelled ||
    skippedRecoverable;

  if (subActive && (pendingLike || isFuture || !due)) {
    return {
      state: 'awaiting_generation',
      label: 'Prevista',
      canGenerate: isFuture || !due || due >= input.todayYmd,
      isFuture: isFuture || !due,
    };
  }

  if (hasOfficialCycleCancellation(input) && !subActive) {
    return { state: 'cancelled', label: 'Cancelada', canGenerate: false, isFuture };
  }

  return { state: 'unknown', label: '—', canGenerate: false, isFuture };
}

export function canEmitFinancialEventType(
  type: FinancialEventType,
  invoiceId: string | null | undefined
): boolean {
  if (type === 'invoice_cancelled' && !invoiceId) return false;
  return true;
}

export function resolveFinancialEventType(
  state: BillingCycleState,
  invoiceId: string | null | undefined
): FinancialEventType | null {
  switch (state) {
    case 'awaiting_generation':
      return 'upcoming_cycle';
    case 'pending_invoice':
      return 'invoice_due';
    case 'paid':
      return 'payment';
    case 'cancelled':
      return invoiceId ? 'invoice_cancelled' : null;
    case 'refunded':
      return 'invoice_refunded';
    case 'failed':
      return 'invoice_failed';
    default:
      return null;
  }
}

export function resolveFinancialEventState(
  ev: Pick<FinancialEvent, 'type' | 'invoiceId' | 'dueYmd'>,
  todayYmd: string
): BillingCycleStateResult {
  if (ev.type === 'payment') return { state: 'paid', label: 'Pago', canGenerate: false, isFuture: false };
  if (ev.type === 'invoice_refunded')
    return { state: 'refunded', label: 'Reembolsada', canGenerate: false, isFuture: false };
  if (ev.type === 'invoice_cancelled' && ev.invoiceId)
    return { state: 'cancelled', label: 'Cancelada', canGenerate: false, isFuture: false };
  if (ev.type === 'invoice_failed')
    return { state: 'failed', label: 'Falhou', canGenerate: false, isFuture: false };
  if (ev.type === 'upcoming_cycle') {
    const isFuture = Boolean(ev.dueYmd && ev.dueYmd >= todayYmd);
    return { state: 'awaiting_generation', label: 'Prevista', canGenerate: true, isFuture };
  }
  if (ev.type === 'invoice_due' || ev.type === 'invoice_generated' || ev.type === 'manual_charge') {
    return { state: 'pending_invoice', label: 'Pendente', canGenerate: false, isFuture: false };
  }
  return { state: 'unknown', label: '—', canGenerate: false, isFuture: false };
}

export function resolveHistoryRowState(
  row: FinancialHistoryRow,
  todayYmd: string
): BillingCycleStateResult & { showGenerateButton: boolean } {
  const base = resolveFinancialEventState(
    {
      type: row.eventType ?? 'upcoming_cycle',
      invoiceId: row.invoiceId,
      dueYmd: row.dueYmd,
    },
    todayYmd
  );
  const showGenerateButton =
    !row.invoiceId &&
    Boolean(row.cycleId?.trim()) &&
    (base.state === 'awaiting_generation' || base.state === 'failed') &&
    (base.state !== 'awaiting_generation' || base.canGenerate);
  return { ...base, showGenerateButton };
}

export function resolveCalendarState(
  ev: Pick<FinancialEvent, 'type' | 'invoiceId' | 'dueYmd'>,
  todayYmd: string
): CalendarVisualKind {
  const s = resolveFinancialEventState(ev, todayYmd);
  switch (s.state) {
    case 'paid':
      return 'paid';
    case 'cancelled':
    case 'refunded':
      return 'cancelled';
    case 'failed':
      return 'overdue';
    case 'pending_invoice':
      return ev.dueYmd && ev.dueYmd < todayYmd ? 'overdue' : 'generated';
    case 'awaiting_generation':
      return 'future';
    default:
      return 'future';
  }
}

export function normalizeTimelineRowForStateMachine(
  row: CrmSubscriptionTimelineRow,
  subscriptionStatus: string,
  todayYmd: string
): CrmSubscriptionTimelineRow {
  if (row.merge_source === 'lifecycle') return row;
  const resolved = resolveBillingCycleState(timelineRowToStateInput(row, subscriptionStatus, todayYmd));
  if (resolved.state === 'awaiting_generation' && !row.invoice_id) {
    return {
      ...row,
      operational_state: 'awaiting_generation',
      operational_state_pt: 'Prevista',
      status_pt: 'Prevista',
      cycle_status: row.cycle_status === 'cancelled' || row.cycle_status === 'skipped' ? 'pending' : row.cycle_status,
    };
  }
  if (resolved.state === 'cancelled' && row.invoice_id) {
    return { ...row, operational_state: 'cancelled', status_pt: 'Cancelada' };
  }
  return row;
}

export function normalizeDetailForBillingStateMachine(
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): CrmSubscriptionDetailPayload {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);
  const subscriptionStatus = detail.subscription.status;
  let changed = false;
  const timeline = detail.timeline.map((row) => {
    const next = normalizeTimelineRowForStateMachine(row, subscriptionStatus, today);
    if (next !== row) changed = true;
    return next;
  });
  return changed ? { ...detail, timeline } : detail;
}

export type BillingStateMachineAssertions = {
  invalid_cancelled_without_invoice: number;
  invalid_invoice_cancelled_events: number;
  active_without_future_competence: number;
  hidden_generate_buttons: number;
  nan_date_sources: number;
};

export function assertBillingStateMachine(
  detail: CrmSubscriptionDetailPayload,
  events: FinancialEvent[],
  todayYmd: string
): BillingStateMachineAssertions {
  const metrics: BillingStateMachineAssertions = {
    invalid_cancelled_without_invoice: 0,
    invalid_invoice_cancelled_events: 0,
    active_without_future_competence: 0,
    hidden_generate_buttons: 0,
    nan_date_sources: 0,
  };

  for (const row of detail.timeline) {
    if (row.merge_source === 'lifecycle') continue;
    const due = row.due_date ?? row.cycle_date;
    if (due && !isValidBillingYmd(due)) metrics.nan_date_sources += 1;
    const resolved = resolveBillingCycleState(timelineRowToStateInput(row, detail.subscription.status, todayYmd));
    if (!row.invoice_id && resolved.state === 'cancelled' && detail.subscription.status === 'active') {
      metrics.invalid_cancelled_without_invoice += 1;
    }
  }

  for (const ev of events) {
    if (!isValidBillingYmd(ev.ymd)) metrics.nan_date_sources += 1;
    if (ev.type === 'invoice_cancelled' && !ev.invoiceId) metrics.invalid_invoice_cancelled_events += 1;
  }

  const subActive = detail.subscription.status === 'active';
  const hasFuture = events.some(
    (e) => e.type === 'upcoming_cycle' && e.dueYmd && e.dueYmd >= todayYmd
  );
  if (subActive && !hasFuture) metrics.active_without_future_competence += 1;

  return metrics;
}
