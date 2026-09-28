import { recordBillingOpsHeartbeat } from '../services/billingOpsHeartbeatService.js';
import { runWorker } from './workerRuntime.js';

export type BillingOpsHeartbeatKey = 'worker' | 'scheduler';

/**
 * Wraps billing cron scripts with unified worker lifecycle without changing billing logic.
 * Always records billing_ops_heartbeat (legacy coexistence).
 */
export async function runBillingOpsWorkerScript<T>(options: {
  workerType: string;
  workerId?: string;
  billingHeartbeatKey?: BillingOpsHeartbeatKey;
  execute: () => Promise<T>;
  toHeartbeatPayload: (result: T) => Record<string, unknown>;
}): Promise<T> {
  let batchResult: T | undefined;

  await runWorker({
    workerType: options.workerType,
    workerId: options.workerId,
    loop: false,
    runBatch: async () => {
      batchResult = await options.execute();
      const payload = options.toHeartbeatPayload(batchResult);
      if (options.billingHeartbeatKey) {
        await recordBillingOpsHeartbeat(options.billingHeartbeatKey, payload);
      }
      return batchResult;
    },
  });

  return batchResult as T;
}
