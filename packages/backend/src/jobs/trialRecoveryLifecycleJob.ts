/**
 * Sprint K — job diário de recuperação de trial (movimentação Kanban apenas).
 */
import type { TrialRecoveryBatchResult } from '../lifecycle/trialRecoveryLifecycleService.js';
import { processTrialRecoveryLifecycleBatch } from '../lifecycle/trialRecoveryLifecycleService.js';

export function getTrialRecoveryLifecyclePollMs(): number {
  return Math.max(3_600_000, parseInt(process.env.TRIAL_RECOVERY_LIFECYCLE_POLL_MS || '86400000', 10));
}

export function isTrialRecoveryLifecycleJobEnabled(): boolean {
  return process.env.TRIAL_RECOVERY_LIFECYCLE_ENABLED !== 'false';
}

export async function runTrialRecoveryLifecycleOnce(): Promise<TrialRecoveryBatchResult> {
  if (!isTrialRecoveryLifecycleJobEnabled()) {
    return {
      status: 'ok',
      scanned: 0,
      eligible: 0,
      promoted: 0,
      skipped: 0,
      attempts: [],
    };
  }

  const result = await processTrialRecoveryLifecycleBatch();
  if (result.promoted > 0 || result.status !== 'ok') {
    console.log(
      `[trial-recovery-lifecycle] status=${result.status} scanned=${result.scanned} eligible=${result.eligible} promoted=${result.promoted} skipped=${result.skipped}`,
    );
  }
  return result;
}
