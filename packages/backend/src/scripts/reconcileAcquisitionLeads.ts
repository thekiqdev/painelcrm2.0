/**
 * P0-D — reconciliação idempotente de leads históricos (estágio/plano/sessão).
 * Uso: npx tsx src/scripts/reconcileAcquisitionLeads.ts [--limit=500]
 */
import { reconcileHistoricalAcquisitionLeads } from '../acquisition/acquisitionLeadReconciliationService.js';

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '500', 10) : 500;
  const summary = await reconcileHistoricalAcquisitionLeads({ limit });
  console.log(JSON.stringify({ ok: true, ...summary }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
