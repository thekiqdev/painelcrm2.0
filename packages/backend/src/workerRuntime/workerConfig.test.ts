import { afterEach, describe, expect, it } from 'vitest';
import {
  workerHeartbeatIntervalSeconds,
  workerReclaimBatchSize,
  workerShutdownTimeoutSeconds,
  workerStaleMinutes,
} from './workerConfig.js';

describe('workerConfig', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('reads env overrides with sane minimums', () => {
    process.env.WORKER_HEARTBEAT_INTERVAL_SECONDS = '3';
    process.env.WORKER_STALE_MINUTES = '0';
    process.env.WORKER_SHUTDOWN_TIMEOUT_SECONDS = '1';
    process.env.WORKER_RECLAIM_BATCH_SIZE = '9999';
    expect(workerHeartbeatIntervalSeconds()).toBe(5);
    expect(workerStaleMinutes()).toBe(1);
    expect(workerShutdownTimeoutSeconds()).toBe(5);
    expect(workerReclaimBatchSize()).toBe(500);
  });
});
