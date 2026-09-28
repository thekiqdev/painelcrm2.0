/**
 * Sprint 8 — ciclo dunning (flag dunning_enabled).
 * Uso: npm run billing:dunning
 * Default dry-run; --apply para emitir eventos.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBillingDunningCycle } from '../services/billingDunningJobService.js';
import { runWorker } from '../workerRuntime/workerRuntime.js';
import { refreshPlatformFeatureFlagRegistry } from '../platform/featureFlagRegistry.js';
import { endDatabasePool } from '../utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  await refreshPlatformFeatureFlagRegistry();
  const apply = process.argv.includes('--apply') || process.env.BILLING2_DUNNING_DRY_RUN === 'false';
  const dryRun = !apply;

  await runWorker({
    workerType: 'billing.dunning',
    loop: false,
    runBatch: async () => {
      const result = await runBillingDunningCycle({ dryRun, limit: 50, actor: 'cron:dunning' });
      console.log('[BILLING]', JSON.stringify({ type: 'dunning_exit', ...result, ts: new Date().toISOString() }));
      return result;
    },
  });
  await endDatabasePool().catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
