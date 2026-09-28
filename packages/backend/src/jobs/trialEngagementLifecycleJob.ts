/**
 * Sprint N2 — job horário de engajamento trial (movimentação Kanban apenas).
 */
import type { TrialEngagementBatchResult } from '../lifecycle/trialEngagementLifecycleService.js';
import { processTrialEngagementLifecycleBatch } from '../lifecycle/trialEngagementLifecycleService.js';

/** Intervalo fixo: 1 hora (sem nova env). */
export const TRIAL_ENGAGEMENT_LIFECYCLE_POLL_MS = 3_600_000;

export async function runTrialEngagementLifecycleOnce(): Promise<TrialEngagementBatchResult> {
  const result = await processTrialEngagementLifecycleBatch();
  if (result.promoted > 0 || result.status !== 'ok') {
    const statusLabel = result.status === 'ok' ? 'completed' : result.status;
    console.log(
      '[trial-engagement-lifecycle]',
      JSON.stringify({
        status: statusLabel,
        scanned: result.scanned,
        eligible: result.eligible,
        promoted: result.promoted,
        skipped: result.skipped,
      }),
    );
  }
  return result;
}
