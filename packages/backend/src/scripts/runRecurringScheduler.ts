/**
 * Scheduler do Billing Engine: enfileira jobs de renovação quando
 * (next_billing_date − dias de antecipação do tenant) <= CURRENT_DATE, depois janela local (LIMIT 500).
 * Uso: cron a cada 10–15 min. Ex.: npx tsx src/scripts/runRecurringScheduler.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { enqueueRenewalJobs } from '../services/recurringBillingJobService.js';
import { recordBillingOpsHeartbeat } from '../services/billingOpsHeartbeatService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  const result = await enqueueRenewalJobs();
  const exitPayload = { type: 'scheduler_exit', ...result, ts: new Date().toISOString() };
  console.log('[BILLING]', JSON.stringify(exitPayload));
  await recordBillingOpsHeartbeat('scheduler', exitPayload);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
