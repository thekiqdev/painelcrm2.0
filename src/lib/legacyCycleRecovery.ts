/**
 * Sprint 4.2B — Recuperação UX de ciclos legados (delegada à State Machine 4.2C).
 */
import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';
import {
  hasOfficialCycleCancellation,
  isLegacyFalseCancelled,
  normalizeDetailForBillingStateMachine,
  normalizeTimelineRowForStateMachine,
  timelineRowToStateInput,
} from './billingStateMachine';

export { hasOfficialCycleCancellation, OFFICIAL_CYCLE_CANCEL_MARKERS } from './billingStateMachine';

export function isLegacyFalseCancelledTimelineRow(
  row: CrmSubscriptionTimelineRow,
  subscriptionStatus: string
): boolean {
  return isLegacyFalseCancelled(timelineRowToStateInput(row, subscriptionStatus, new Date().toISOString().slice(0, 10)));
}

export function normalizeDetailForLegacyCycleRecovery(
  detail: CrmSubscriptionDetailPayload
): CrmSubscriptionDetailPayload {
  return normalizeDetailForBillingStateMachine(detail);
}

export { normalizeTimelineRowForStateMachine };
