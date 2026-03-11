/**
 * Reconciliação de pagamentos: vincula invoices pending sem asaas_payment_id ao pagamento no gateway.
 * Uso: cron a cada 30 min. Ex.: npm run billing:reconciliation
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runReconciliation } from '../services/billingReconciliationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  const result = await runReconciliation();
  console.log('[BILLING]', JSON.stringify({ type: 'reconciliation_exit', ...result, ts: new Date().toISOString() }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
