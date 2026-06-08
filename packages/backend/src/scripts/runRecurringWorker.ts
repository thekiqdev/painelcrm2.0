/**
 * Worker do Billing Engine: processa um batch de jobs (FOR UPDATE SKIP LOCKED LIMIT 100).
 * Uso: cron a cada 1–2 min ou loop contínuo. Ex.: npx tsx src/scripts/runRecurringWorker.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { processNextBatch, processChildItemDueInvoices } from '../services/recurringBillingJobService.js';
import { flushBillingNotificationSideEffects } from '../services/notificationsEngine/billingNotificationFlush.js';
import { processNotificationOutboundRetriesBatch } from '../services/notificationsEngine/notificationOutboundRetryWorker.js';
import { runBillingOpsWorkerScript } from '../workerRuntime/billingWorkerAdapter.js';
import { refreshPlatformFeatureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { endDatabasePool } from '../utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

const workerId = process.env.RECURRING_WORKER_ID ?? `worker-${process.pid}`;

async function main() {
  await refreshPlatformFeatureFlagRegistry();
  await runBillingOpsWorkerScript({
    workerType: 'billing.recurring_worker',
    workerId,
    billingHeartbeatKey: 'worker',
    execute: async () => {
      const child = await processChildItemDueInvoices();
      const result = await processNextBatch(workerId);
      const notifyFlush = await flushBillingNotificationSideEffects();
      const outboundRetry = await processNotificationOutboundRetriesBatch(50);
      return {
        type: 'worker_exit' as const,
        workerId,
        child_invoices_e2: child,
        ...result,
        notify_flush: notifyFlush,
        outbound_retry: outboundRetry,
        ts: new Date().toISOString(),
      };
    },
    toHeartbeatPayload: (payload) => payload,
  });
  console.log('[BILLING]', JSON.stringify({ step: 'worker_script_complete', workerId }));
  await endDatabasePool().catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
