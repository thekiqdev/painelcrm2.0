import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./workerRuntime.js', () => ({
  runWorker: vi.fn(async (opts: { runBatch: () => Promise<unknown> }) => opts.runBatch()),
}));

vi.mock('../services/billingOpsHeartbeatService.js', () => ({
  recordBillingOpsHeartbeat: vi.fn(),
}));

import { recordBillingOpsHeartbeat } from '../services/billingOpsHeartbeatService.js';
import { runBillingOpsWorkerScript } from './billingWorkerAdapter.js';
import { runWorker } from './workerRuntime.js';

describe('billingWorkerAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs billing logic and records legacy heartbeat', async () => {
    const result = await runBillingOpsWorkerScript({
      workerType: 'billing.recurring_worker',
      workerId: 'worker-1',
      billingHeartbeatKey: 'worker',
      execute: async () => ({ type: 'worker_exit', processed: 2 }),
      toHeartbeatPayload: (p) => p,
    });
    expect(runWorker).toHaveBeenCalled();
    expect(result).toEqual({ type: 'worker_exit', processed: 2 });
    expect(recordBillingOpsHeartbeat).toHaveBeenCalledWith('worker', {
      type: 'worker_exit',
      processed: 2,
    });
  });
});
