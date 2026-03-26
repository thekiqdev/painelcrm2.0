/**
 * Worker do Billing Engine: processa um batch de jobs (FOR UPDATE SKIP LOCKED LIMIT 100).
 * Uso: cron a cada 1–2 min ou loop contínuo. Ex.: npx tsx src/scripts/runRecurringWorker.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { processNextBatch, processChildItemDueInvoices } from '../services/recurringBillingJobService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

const workerId = process.env.RECURRING_WORKER_ID ?? `worker-${process.pid}`;

async function main() {
  const child = await processChildItemDueInvoices();
  const result = await processNextBatch(workerId);
  console.log(
    '[BILLING]',
    JSON.stringify({ type: 'worker_exit', workerId, child_invoices_e2: child, ...result, ts: new Date().toISOString() })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
