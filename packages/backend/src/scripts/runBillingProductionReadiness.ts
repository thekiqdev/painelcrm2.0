/**
 * Sprint 4.2 — CLI Production Readiness Certification.
 * Uso: npm run billing:production-cert [-- --tenant=<uuid>] [--dry-run] [--limit=500]
 */
import { runProductionReadinessCertification } from '../billingPlatform/audit/productionReadinessOrchestrator.js';

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
  console.log('[PRODUCTION_CERT] Sprint 4.2 — Production Readiness Certification');
  console.log(
    `[PRODUCTION_CERT] tenant=${args.tenantId ?? 'ALL'} dry_run=${Boolean(args.dryRun)} limit=${args.limit ?? 5000}`
  );

  const report = await runProductionReadinessCertification({
    tenantId: args.tenantId,
    dryRun: args.dryRun,
    repair: !args.dryRun,
    subscriptionLimit: args.limit,
  });

  const { summary } = report;
  console.log(`[PRODUCTION_CERT] status=${summary.status} certified=${summary.certified}`);
  console.log(`[PRODUCTION_CERT] duration_ms=${summary.duration_ms}`);
  console.log(`[PRODUCTION_CERT] deployment_approved=${summary.deployment_approved}`);

  for (const [mod, meta] of Object.entries(summary.modules)) {
    console.log(
      `[PRODUCTION_CERT] module=${mod} certified=${meta.certified} issues=${meta.issue_count} repairs=${meta.repair_count}`
    );
  }

  const failedChecklist = summary.checklist.filter((c) => !c.passed);
  if (failedChecklist.length > 0) {
    for (const c of failedChecklist) {
      console.error(`[PRODUCTION_CHECKLIST] FAIL: ${c.item}`);
    }
  }

  console.log(`[PRODUCTION_CERT] summary=${report.artifact_paths['production-readiness-summary.json']}`);

  if (!summary.certified) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[PRODUCTION_CERT] Erro fatal:', e);
  process.exitCode = 1;
});
