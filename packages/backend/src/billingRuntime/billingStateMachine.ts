/**
 * Sprint 4.2C — Máquina oficial de estados (backend Runtime / UX).
 */
import { normalizeBillingDate, safeTodayYmd } from '../utils/billingSafeDate.js';

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

export function isValidBillingYmd(value: unknown): boolean {
  const ymd = normalizeBillingDate(value);
  return ymd != null && !INVALID_YMD_RE.test(ymd);
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
  if (cycle !== 'cancelled' || input.invoiceId) return false;
  if ((input.subscriptionStatus ?? '').toLowerCase() === 'cancelled') return false;
  return !hasOfficialCycleCancellation(input);
}

export function resolveBillingCycleState(input: BillingCycleStateInput): BillingCycleStateResult {
  const sub = (input.subscriptionStatus ?? '').toLowerCase();
  const subActive = sub === 'active' || sub === 'paused' || sub === 'past_due' || sub === 'trialing';
  const invStatus = (input.invoiceStatus ?? '').toLowerCase();
  const due = normalizeBillingDate(input.dueYmd);
  const isFuture = Boolean(due && due >= input.todayYmd);

  if (input.invoiceId) {
    if (invStatus === 'paid') return { state: 'paid', label: 'Pago', canGenerate: false, isFuture };
    if (invStatus === 'refunded' || invStatus === 'chargeback')
      return { state: 'refunded', label: 'Reembolsada', canGenerate: false, isFuture };
    if (invStatus === 'cancelled')
      return { state: 'cancelled', label: 'Cancelada', canGenerate: false, isFuture };
    return { state: 'pending_invoice', label: 'Pendente', canGenerate: false, isFuture };
  }

  if (sub === 'cancelled') {
    return { state: 'cancelled', label: 'Cancelada', canGenerate: false, isFuture };
  }

  const cycle = (input.cycleStatus ?? '').toLowerCase();
  const skippedRecoverable =
    cycle === 'skipped' && (isSkippedRecoverable(input.skippedReason) || subActive);
  const legacyCancelled = isLegacyFalseCancelled(input);
  const pendingLike =
    cycle === 'pending' ||
    legacyCancelled ||
    skippedRecoverable ||
    cycle === 'failed';

  if (subActive && (pendingLike || isFuture || !due)) {
    return {
      state: 'awaiting_generation',
      label: 'Prevista',
      canGenerate: isFuture || !due || (due != null && due >= input.todayYmd),
      isFuture: isFuture || !due,
    };
  }

  if (cycle === 'failed') {
    return { state: 'failed', label: 'Falhou', canGenerate: false, isFuture };
  }

  return { state: 'unknown', label: '—', canGenerate: false, isFuture };
}

export function assertNoInvalidCancelledWithoutInvoice(
  rows: Array<{
    invoice_id: string | null;
    cycle_status: string | null;
    skipped_reason: string | null;
    subscription_status: string;
    due_ymd: string | null;
  }>,
  todayYmd: string = safeTodayYmd()
): { invalid_count: number; samples: string[] } {
  const samples: string[] = [];
  let invalid_count = 0;
  for (const row of rows) {
    const resolved = resolveBillingCycleState({
      cycleStatus: row.cycle_status,
      invoiceId: row.invoice_id,
      skippedReason: row.skipped_reason,
      subscriptionStatus: row.subscription_status,
      dueYmd: row.due_ymd,
      todayYmd,
    });
    if (!row.invoice_id && resolved.state === 'cancelled' && row.subscription_status === 'active') {
      invalid_count += 1;
      if (samples.length < 25) samples.push(`${row.invoice_id}:${row.due_ymd}`);
    }
    if (row.due_ymd && !isValidBillingYmd(row.due_ymd)) {
      invalid_count += 1;
    }
  }
  return { invalid_count, samples };
}
