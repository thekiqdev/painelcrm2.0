/**
 * Reconciliação read-only subscription_cycles × jobs × faturas CRM (Etapa 4).
 * Uso: npm run billing:subscription-cycles-reconcile
 * Opções: SAMPLE=25 npm run billing:subscription-cycles-reconcile
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSubscriptionCyclesReconciliation } from '../services/subscriptionCyclesReconciliationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config();

async function main() {
  const raw = process.env.SAMPLE;
  const sampleLimit = raw != null && raw.trim() !== '' ? parseInt(raw, 10) : undefined;
  const report = await runSubscriptionCyclesReconciliation(
    Number.isFinite(sampleLimit) ? { sampleLimit } : undefined
  );

  console.log(JSON.stringify({ type: 'subscription_cycles_reconciliation', ...report }, null, 2));

  const s = report.summary;
  const total =
    s.invoiced_cycle_missing_invoice_id +
    s.customer_invoice_subscription_missing_cycle +
    s.completed_job_customer_invoice_cycle_mismatch +
    s.queued_cycle_without_active_job +
    s.processing_cycle_without_processing_job +
    s.terminal_cycle_missing_reason +
    s.invoiced_cycle_invoice_orphan_or_wrong_subscription;

  if (!report.subscription_cycles_table_exists) {
    console.error('[subscription_cycles_reconciliation] Tabela ausente ou inacessível. Rode migrações (141+).');
    process.exit(2);
  }

  if (total > 0) {
    console.error(
      `[subscription_cycles_reconciliation] Encontradas ${total} divergências (ver summary e samples no JSON acima).`
    );
    process.exit(1);
  }

  console.log('[subscription_cycles_reconciliation] OK — nenhuma divergência nas verificações configuradas.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
