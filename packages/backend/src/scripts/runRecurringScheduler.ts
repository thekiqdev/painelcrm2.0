/**
 * Scheduler do Billing Engine: enfileira jobs de renovação quando
 * (next_billing_date − dias de antecipação do tenant) <= CURRENT_DATE, depois janela local (LIMIT 500).
 * Uso: cron a cada 10–15 min. Ex.: npx tsx src/scripts/runRecurringScheduler.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { enqueueRenewalJobs } from '../services/recurringBillingJobService.js';
import { runBillingOpsWorkerScript } from '../workerRuntime/billingWorkerAdapter.js';
import { refreshPlatformFeatureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { endDatabasePool } from '../utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  await refreshPlatformFeatureFlagRegistry();
  const payload = await runBillingOpsWorkerScript({
    workerType: 'billing.recurring_scheduler',
    billingHeartbeatKey: 'scheduler',
    execute: async () => {
      const result = await enqueueRenewalJobs();
      return { type: 'scheduler_exit' as const, ...result, ts: new Date().toISOString() };
    },
    toHeartbeatPayload: (p) => p,
  });
  console.log('[BILLING]', JSON.stringify(payload));
  await endDatabasePool().catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
