/**
 * Billing Recovery / Reconciliation (Fase 3): scan, diagnose, light repair, report.
 * Uso: cron a cada 15–30 min ou manual. Ex.: npm run billing:ops-reconciliation
 *
 * BILLING_RECOVERY_DRY_RUN=true (default) — apenas loga e audita sem aplicar UPDATEs.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBillingRecovery, isBillingRecoveryDryRun } from '../services/billingRecoveryService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  const dryRun = isBillingRecoveryDryRun();
  console.log(
    '[BILLING_RECOVERY]',
    JSON.stringify({
      step: 'script_start',
      dry_run: dryRun,
      hint: 'Defina BILLING_RECOVERY_DRY_RUN=false para aplicar reparações leves.',
    })
  );
  const report = await runBillingRecovery({ dry_run: dryRun });
  console.log('[BILLING_RECOVERY]', JSON.stringify({ step: 'script_report', ...report }));
  process.exit(0);
}

main().catch((e) => {
  console.error('[BILLING_RECOVERY]', e);
  process.exit(1);
});
