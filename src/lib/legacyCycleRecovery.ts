/**
 * Sprint 4.2B — Recuperação UX de ciclos legados (espelha backend legacyCancelledCycleRecovery).
 */
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';

const OFFICIAL_CYCLE_CANCEL_MARKERS = [
  'cancel_subscription',
  'cancel_invoice',
  'cancel_cycle',
  'subscription_cancelled',
  'manual_cancel',
  'billing.cancel_invoice',
  'billing.cancel_subscription',
  'billing.cancel_charge',
] as const;

export function hasOfficialCycleCancellation(input: {
  cycleStatus?: string | null;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  skippedReason?: string | null;
  subscriptionStatus: string;
}): boolean {
  const sub = (input.subscriptionStatus ?? '').toLowerCase();
  if (sub === 'cancelled') return true;

  const invSt = (input.invoiceStatus ?? '').toLowerCase();
  if (input.invoiceId && invSt === 'cancelled') return true;

  const reason = (input.skippedReason ?? '').toLowerCase().trim();
  if (!reason) return false;
  return OFFICIAL_CYCLE_CANCEL_MARKERS.some((marker) => reason.includes(marker.toLowerCase()));
}

export function isLegacyFalseCancelledTimelineRow(
  row: CrmSubscriptionTimelineRow,
  subscriptionStatus: string
): boolean {
  const cycle = (row.cycle_status ?? row.operational_state ?? '').toLowerCase();
  const isCancelled = cycle === 'cancelled' || row.operational_state === 'cancelled';
  if (!isCancelled) return false;
  if (row.invoice_id) return false;
  if ((subscriptionStatus ?? '').toLowerCase() === 'cancelled') return false;

  const skippedReason =
    (row as CrmSubscriptionTimelineRow & { cycle_skipped_reason?: string | null }).cycle_skipped_reason ??
    null;

  return !hasOfficialCycleCancellation({
    cycleStatus: 'cancelled',
    invoiceId: null,
    invoiceStatus: row.invoice_status,
    skippedReason,
    subscriptionStatus,
  });
}

/** Normaliza timeline antes de montar eventos financeiros (Histórico = Calendário). */
export function normalizeDetailForLegacyCycleRecovery(
  detail: CrmSubscriptionDetailPayload
): CrmSubscriptionDetailPayload {
  const subscriptionStatus = detail.subscription.status;
  let changed = false;
  const timeline = detail.timeline.map((row) => {
    if (row.merge_source === 'lifecycle') return row;
    if (!isLegacyFalseCancelledTimelineRow(row, subscriptionStatus)) return row;
    changed = true;
    return {
      ...row,
      operational_state: 'awaiting_generation' as const,
      operational_state_pt: 'Prevista',
      status_pt: 'Prevista',
      cycle_status: 'pending',
    };
  });
  return changed ? { ...detail, timeline } : detail;
}
