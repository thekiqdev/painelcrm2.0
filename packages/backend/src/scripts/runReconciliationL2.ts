/**
 * Sprint 8 — job L2 (+ L1 opcional se reconciliation_auto).
 * Uso: npm run billing:reconciliation-l2
 * Flags: reconciliation_l2_enabled (obrigatória para L2 apply);
 *        DRY via env BILLING2_L2_DRY_RUN=true (default) ou --apply
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runReconciliationL2 } from '../services/billingReconciliationL2Service.js';
import { runReconciliation } from '../services/billingReconciliationService.js';
import { isBilling2FlagEnabled } from '../services/billing2/billingFeatureFlags.js';
import { runWorker } from '../workerRuntime/workerRuntime.js';
import { refreshPlatformFeatureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { endDatabasePool } from '../utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  await refreshPlatformFeatureFlagRegistry();
  const apply = process.argv.includes('--apply') || process.env.BILLING2_L2_DRY_RUN === 'false';
  const dryRun = !apply;

  await runWorker({
    workerType: 'billing.reconciliation_l2',
    loop: false,
    runBatch: async () => {
      const l2 = await runReconciliationL2({ dryRun, limit: 50, actor: 'cron:l2' });
      console.log('[BILLING]', JSON.stringify({ type: 'reconciliation_l2_exit', ...l2, ts: new Date().toISOString() }));

      if (await isBilling2FlagEnabled('reconciliation_auto')) {
        const l1 = await runReconciliation();
        console.log('[BILLING]', JSON.stringify({ type: 'reconciliation_l1_exit', ...l1, ts: new Date().toISOString() }));
      }

      return l2;
    },
  });
  await endDatabasePool().catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
