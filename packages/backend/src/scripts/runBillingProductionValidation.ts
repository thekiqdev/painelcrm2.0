/**
 * Sprint 4.2A — CLI Production Validation & Certification.
 * Uso: npm run billing:production-validation [-- --tenant=<uuid>] [--dry-run] [--limit=500]
 */
import { runProductionValidationCertification } from '../billingPlatform/audit/validation/productionValidationOrchestrator.js';

function parseArgs(argv: string[]): {
  tenantId?: string;
  dryRun?: boolean;
  limit?: number;
} {
  const out: { tenantId?: string; dryRun?: boolean; limit?: number } = {};
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--tenant=')) out.tenantId = arg.slice('--tenant='.length).trim() || undefined;
    else if (arg.startsWith('--limit=')) {
      const n = parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(n)) out.limit = n;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log('[PRODUCTION_VALIDATION] Sprint 4.2A — Production Validation & Certification');
  console.log(
    `[PRODUCTION_VALIDATION] tenant=${args.tenantId ?? 'ALL'} dry_run=${Boolean(args.dryRun)} limit=${args.limit ?? 5000}`
  );

  const report = await runProductionValidationCertification({
    tenantId: args.tenantId,
    dryRun: args.dryRun,
    repair: !args.dryRun,
    subscriptionLimit: args.limit,
  });

  const { summary, certification, auditor, health, stress } = report;
  console.log(`[PRODUCTION_VALIDATION] status=${summary.status} certified=${summary.certified}`);
  console.log(`[PRODUCTION_VALIDATION] billing_health_score=${health.billing_health_score}`);
  console.log(`[PRODUCTION_VALIDATION] auditor_certified=${auditor.auditor_certified}`);
  console.log(`[PRODUCTION_VALIDATION] certificates=${certification.certificates.auditor} / ${certification.certificates.production}`);
  console.log(`[PRODUCTION_VALIDATION] stress_certified=${stress.certified}`);
  console.log(`[PRODUCTION_VALIDATION] duration_ms=${summary.duration_ms}`);

  for (const scenario of auditor.scenarios) {
    const mark = scenario.passed ? 'PASS' : 'FAIL';
    console.log(`[AUDITOR_SCENARIO] ${mark} ${scenario.scenario_id}`);
  }

  const failedDod = summary.definition_of_done.filter((d) => !d.passed);
  if (failedDod.length > 0) {
    for (const d of failedDod) {
      console.error(`[DEFINITION_OF_DONE] FAIL: ${d.item}`);
    }
  }

  console.log(`[PRODUCTION_VALIDATION] snapshot=${report.artifact_paths['production-ready-snapshot.json']}`);

  if (!summary.certified) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[PRODUCTION_VALIDATION] Erro fatal:', e);
  process.exitCode = 1;
});
