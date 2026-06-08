/**
 * Reconciliação de pagamentos: vincula invoices pending sem gateway_reference_id ao pagamento no gateway.
 * Uso: cron a cada 30 min. Ex.: npm run billing:reconciliation
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runReconciliation } from '../services/billingReconciliationService.js';
import { runWorker } from '../workerRuntime/workerRuntime.js';
import { refreshPlatformFeatureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { endDatabasePool } from '../utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  await refreshPlatformFeatureFlagRegistry();
  await runWorker({
    workerType: 'billing.payment_reconciliation',
    loop: false,
    runBatch: async () => {
      const result = await runReconciliation();
      console.log('[BILLING]', JSON.stringify({ type: 'reconciliation_exit', ...result, ts: new Date().toISOString() }));
      return result;
    },
  });
  await endDatabasePool().catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
