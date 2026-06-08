import { workerReclaimBatchSize, workerStaleMinutes } from './workerConfig.js';
import { isWorkerReclaimEnabled } from './workerFlags.js';
import {
  clearStaleLocks,
  findStaleWorkerHeartbeats,
  markWorkersReclaimed,
} from './workerHeartbeatRepository.js';
import { logWorkerReclaim } from './workerLogger.js';
import type { WorkerReclaimResult } from './workerTypes.js';

/**
 * Foundation: reclaim stale heartbeat rows only — does NOT touch billing job locks or outbox claims.
 */
export async function reclaimStaleWorkerHeartbeats(): Promise<WorkerReclaimResult> {
  const enabled = await isWorkerReclaimEnabled();
  if (!enabled) {
    return { degraded: 0, failed: 0, locks_cleared: 0 };
  }

  const staleMinutes = workerStaleMinutes();
  const batchSize = workerReclaimBatchSize();
  const stale = await findStaleWorkerHeartbeats(staleMinutes, batchSize);

  const degradedIds: string[] = [];
  const failedIds: string[] = [];

  for (const row of stale) {
    const ageMin =
      (Date.now() - new Date(row.last_heartbeat_at).getTime()) / 60_000;
    if (ageMin > staleMinutes * 3) {
      failedIds.push(row.worker_id);
    } else {
      degradedIds.push(row.worker_id);
    }
  }

  const degraded = await markWorkersReclaimed(degradedIds, 'degraded');
  const failed = await markWorkersReclaimed(failedIds, 'failed');
  const locks_cleared = await clearStaleLocks(staleMinutes, batchSize);

  if (degraded + failed + locks_cleared > 0) {
    logWorkerReclaim('stale_reclaim_complete', {
      stale_minutes: staleMinutes,
      degraded,
      failed,
      locks_cleared,
      scanned: stale.length,
    });
  }

  return { degraded, failed, locks_cleared };
}
