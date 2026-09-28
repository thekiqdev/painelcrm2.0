/**
 * Sprint 4.2B — LegacyCancelledCycleAuditor
 */
import {
  isLegacyFalseCancelledCycle,
  listLegacyFalseCancelledCycles,
  repairLegacyFalseCancelledCycles,
} from '../../../services/legacyCancelledCycleRecovery.js';
import { writeAuditArtifact, DEFAULT_PRODUCTION_AUDIT_DIR } from '../auditReportWriter.js';
import type { AuditIssue, AuditModuleResult, ProductionReadinessOptions } from '../types.js';

export const LEGACY_CYCLE_RECOVERY_ARTIFACT = 'legacy-cycle-recovery.json';

export type LegacyCycleRecoveryReport = {
  sprint: '4.2B';
  title: 'Legacy Cancelled Cycle Recovery';
  generated_at_iso: string;
  duration_ms: number;
  certified: boolean;
  false_cancelled_detected: number;
  repaired: number;
  dry_run: boolean;
  samples: Array<{
    cycle_id: string;
    subscription_id: string;
    tenant_id: string;
    cycle_date: string;
    skipped_reason: string | null;
  }>;
  repairs: string[];
  issues: AuditIssue[];
};

export async function auditLegacyCancelledCycles(
  options: ProductionReadinessOptions = {}
): Promise<AuditModuleResult> {
  const started = Date.now();
  const issues: AuditIssue[] = [];
  const repairs: string[] = [];
  const dryRun = options.dryRun === true || options.repair === false;

  const candidates = await listLegacyFalseCancelledCycles({
    tenantId: options.tenantId,
    limit: options.subscriptionLimit ?? 5000,
  });

  for (const row of candidates.slice(0, 50)) {
    issues.push({
      code: 'legacy_false_cancelled_cycle',
      severity: 'warning',
      message: `Ciclo ${row.cycle_date} marcado cancelled sem cancelamento oficial`,
      tenant_id: row.tenant_id,
      subscription_id: row.subscription_id,
      meta: {
        cycle_id: row.cycle_id,
        skipped_reason: row.skipped_reason,
        recoverable: isLegacyFalseCancelledCycle({
          cycleStatus: 'cancelled',
          invoiceId: null,
          skippedReason: row.skipped_reason,
          subscriptionStatus: row.subscription_status,
        }),
      },
    });
  }

  let repaired = 0;
  if (!dryRun && candidates.length > 0) {
    const repairResult = await repairLegacyFalseCancelledCycles({
      tenantId: options.tenantId,
      dryRun: false,
    });
    repaired = repairResult.repaired;
    for (const id of repairResult.cycle_ids) {
      repairs.push(`legacy_cycle_recovered:${id}`);
    }
  }

  const report: LegacyCycleRecoveryReport = {
    sprint: '4.2B',
    title: 'Legacy Cancelled Cycle Recovery',
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    certified: candidates.length === 0 || (!dryRun && repaired === candidates.length),
    false_cancelled_detected: candidates.length,
    repaired,
    dry_run: dryRun,
    samples: candidates.slice(0, 25).map((c) => ({
      cycle_id: c.cycle_id,
      subscription_id: c.subscription_id,
      tenant_id: c.tenant_id,
      cycle_date: c.cycle_date,
      skipped_reason: c.skipped_reason,
    })),
    repairs,
    issues,
  };

  const outputDir = options.outputDir ?? DEFAULT_PRODUCTION_AUDIT_DIR;
  writeAuditArtifact(LEGACY_CYCLE_RECOVERY_ARTIFACT, report, outputDir);

  return {
    module: 'legacyCancelledCycles',
    certified: candidates.length === 0 || (!dryRun && repaired === candidates.length),
    generated_at_iso: report.generated_at_iso,
    duration_ms: report.duration_ms,
    issues,
    repairs,
    metrics: {
      false_cancelled_detected: candidates.length,
      repaired,
      dry_run: dryRun,
    },
    samples: report.samples,
  };
}
