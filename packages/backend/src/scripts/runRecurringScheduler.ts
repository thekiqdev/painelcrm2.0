/**
 * Scheduler do Billing Engine: enfileira jobs de renovação (next_billing_date <= CURRENT_DATE, LIMIT 500).
 * Uso: cron a cada 10–15 min. Ex.: npx tsx src/scripts/runRecurringScheduler.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { enqueueRenewalJobs } from '../services/recurringBillingJobService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  const result = await enqueueRenewalJobs();
  console.log('[BILLING]', JSON.stringify({ type: 'scheduler_exit', ...result, ts: new Date().toISOString() }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
