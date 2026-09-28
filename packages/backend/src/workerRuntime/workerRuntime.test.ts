import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./workerFlags.js', () => ({
  isWorkerRuntimeEnabled: vi.fn(),
  isWorkerHeartbeatEnabled: vi.fn(),
  isWorkerReclaimEnabled: vi.fn(),
  isWorkerHealthEnabled: vi.fn(),
}));

vi.mock('./workerHeartbeatRepository.js', () => ({
  upsertWorkerHeartbeat: vi.fn(),
  platformWorkerHeartbeatTableExists: vi.fn().mockResolvedValue(true),
  findStaleWorkerHeartbeats: vi.fn(),
  markWorkersReclaimed: vi.fn(),
  clearStaleLocks: vi.fn(),
}));

vi.mock('./workerReclaimService.js', () => ({
  reclaimStaleWorkerHeartbeats: vi.fn().mockResolvedValue({ degraded: 0, failed: 0, locks_cleared: 0 }),
}));

import {
  isWorkerHealthEnabled,
  isWorkerHeartbeatEnabled,
  isWorkerReclaimEnabled,
  isWorkerRuntimeEnabled,
} from './workerFlags.js';
import { upsertWorkerHeartbeat } from './workerHeartbeatRepository.js';
import { reclaimStaleWorkerHeartbeats } from './workerReclaimService.js';
import { runWorker, requestWorkerShutdown, isWorkerShutdownRequested } from './workerRuntime.js';
import { getWorkerHealthSnapshot } from './workerHealthService.js';

describe('workerRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isWorkerRuntimeEnabled).mockResolvedValue(true);
    vi.mocked(isWorkerHeartbeatEnabled).mockResolvedValue(false);
    vi.mocked(isWorkerReclaimEnabled).mockResolvedValue(false);
    vi.mocked(isWorkerHealthEnabled).mockResolvedValue(false);
  });

  afterEach(() => {
    requestWorkerShutdown();
  });

  it('runs single batch when loop is false', async () => {
    const runBatch = vi.fn().mockResolvedValue({ ok: true });
    const result = await runWorker({
      workerType: 'test.worker',
      loop: false,
      runBatch,
    });
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it('persists heartbeat when heartbeat flag is on', async () => {
    vi.mocked(isWorkerHeartbeatEnabled).mockResolvedValue(true);
    await runWorker({
      workerType: 'test.heartbeat',
      workerId: 'test-id-1',
      loop: false,
      runBatch: async () => 'done',
    });
    expect(upsertWorkerHeartbeat).toHaveBeenCalled();
    const statuses = vi.mocked(upsertWorkerHeartbeat).mock.calls.map((c) => c[0].status);
    expect(statuses).toContain('starting');
    expect(statuses).toContain('stopped');
  });

  it('stops loop after shutdown request', async () => {
    const runBatch = vi.fn().mockImplementation(async () => {
      requestWorkerShutdown();
      return null;
    });
    await runWorker({
      workerType: 'test.loop',
      loop: true,
      pollIntervalMs: 10,
      runBatch,
    });
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(isWorkerShutdownRequested()).toBe(true);
  });

  it('invokes reclaim between batches when reclaim flag on', async () => {
    vi.mocked(isWorkerReclaimEnabled).mockResolvedValue(true);
    const runBatch = vi.fn().mockImplementation(async () => {
      requestWorkerShutdown();
    });
    await runWorker({ workerType: 'test.reclaim', loop: true, pollIntervalMs: 5, runBatch });
    expect(reclaimStaleWorkerHeartbeats).toHaveBeenCalled();
  });

  it('marks batch errors as degraded heartbeat', async () => {
    vi.mocked(isWorkerHeartbeatEnabled).mockResolvedValue(true);
    await expect(
      runWorker({
        workerType: 'test.fail',
        loop: false,
        runBatch: async () => {
          throw new Error('batch_failed');
        },
      }),
    ).rejects.toThrow('batch_failed');
    const degraded = vi
      .mocked(upsertWorkerHeartbeat)
      .mock.calls.some((c) => c[0].status === 'degraded' && c[0].lastError === true);
    expect(degraded).toBe(true);
  });
});

describe('workerHealthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty snapshot when health flag off', async () => {
    vi.mocked(isWorkerHealthEnabled).mockResolvedValue(false);
    const snap = await getWorkerHealthSnapshot();
    expect(snap.enabled).toBe(false);
    expect(snap.workers).toHaveLength(0);
  });
});
