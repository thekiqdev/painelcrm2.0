import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./workerFlags.js', () => ({
  isWorkerReclaimEnabled: vi.fn(),
}));

vi.mock('./workerHeartbeatRepository.js', () => ({
  findStaleWorkerHeartbeats: vi.fn(),
  markWorkersReclaimed: vi.fn(),
  clearStaleLocks: vi.fn(),
}));

import { isWorkerReclaimEnabled } from './workerFlags.js';
import {
  clearStaleLocks,
  findStaleWorkerHeartbeats,
  markWorkersReclaimed,
} from './workerHeartbeatRepository.js';
import { reclaimStaleWorkerHeartbeats } from './workerReclaimService.js';

describe('workerReclaimService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkerReclaimEnabled).mockResolvedValue(true);
  });

  it('no-ops when reclaim flag is off', async () => {
    vi.mocked(isWorkerReclaimEnabled).mockResolvedValue(false);
    const result = await reclaimStaleWorkerHeartbeats();
    expect(result).toEqual({ degraded: 0, failed: 0, locks_cleared: 0 });
    expect(findStaleWorkerHeartbeats).not.toHaveBeenCalled();
  });

  it('reclaims stale workers into degraded and failed buckets', async () => {
    const now = Date.now();
    vi.mocked(findStaleWorkerHeartbeats).mockResolvedValue([
      {
        worker_id: 'w1',
        worker_type: 'billing.recurring_worker',
        status: 'healthy',
        started_at: new Date(now - 3_600_000).toISOString(),
        last_heartbeat_at: new Date(now - 20 * 60_000).toISOString(),
        last_success_at: null,
        last_error_at: null,
        correlation_id: null,
        lock_token: 'lock-1',
        locked_at: new Date(now - 3_600_000).toISOString(),
        metadata_json: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        worker_id: 'w2',
        worker_type: 'outbox.publisher',
        status: 'healthy',
        started_at: new Date(now - 10_800_000).toISOString(),
        last_heartbeat_at: new Date(now - 120 * 60_000).toISOString(),
        last_success_at: null,
        last_error_at: null,
        correlation_id: null,
        lock_token: null,
        locked_at: null,
        metadata_json: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    vi.mocked(markWorkersReclaimed).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    vi.mocked(clearStaleLocks).mockResolvedValue(1);

    const result = await reclaimStaleWorkerHeartbeats();
    expect(result.degraded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.locks_cleared).toBe(1);
  });
});
