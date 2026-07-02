/**
 * Sprint 4.2A — Production Validation orchestrator.
 */
import { runProductionReadinessCertification } from '../productionReadinessOrchestrator.js';
import { writeAuditArtifact, DEFAULT_PRODUCTION_AUDIT_DIR } from '../auditReportWriter.js';
import type { ProductionReadinessOptions } from '../types.js';
import { runAuditorScenarioValidation, validateModuleCoverage } from './auditorScenarioValidator.js';
import { computeBillingHealthScore } from './billingHealthScore.js';
import { runStressValidation } from './stressValidation.js';
import {
  buildProductionCertification,
  buildProductionValidationSummary,
  type ProductionCertification,
  type ProductionValidationSummary,
} from './productionCertificate.js';
import type { ProductionReadinessReport } from '../productionReadinessOrchestrator.js';
import type { AuditorCertificationReport } from './auditorScenarioValidator.js';
import type { BillingHealthScoreReport } from './billingHealthScore.js';
import type { StressValidationReport } from './stressValidation.js';
import { auditLegacyCancelledCycles, LEGACY_CYCLE_RECOVERY_ARTIFACT } from '../legacy/legacyCancelledCycleAuditor.js';

export const PRODUCTION_VALIDATION_ARTIFACTS = [
  'production-validation.json',
  'auditor-certification.json',
  'health-score.json',
  'production-health-score.json',
  'deployment-certification.json',
  'production-certification.json',
  'production-ready-snapshot.json',
  LEGACY_CYCLE_RECOVERY_ARTIFACT,
] as const;

export type ProductionValidationReport = {
  summary: ProductionValidationSummary;
  readiness: ProductionReadinessReport;
  auditor: AuditorCertificationReport;
  health: BillingHealthScoreReport;
  stress: StressValidationReport;
  certification: ProductionCertification;
  artifact_paths: Record<string, string>;
};

export async function runProductionValidationCertification(
  options: ProductionReadinessOptions = {}
): Promise<ProductionValidationReport> {
  const started = Date.now();
  const outputDir = options.outputDir ?? DEFAULT_PRODUCTION_AUDIT_DIR;

  const readiness = await runProductionReadinessCertification(options);
  const legacyCycles = await auditLegacyCancelledCycles(options);
  readiness.modules.legacyCancelledCycles = legacyCycles;
  const auditor = runAuditorScenarioValidation();
  const moduleCoverage = validateModuleCoverage(readiness.modules);
  if (!moduleCoverage.covered) {
    auditor.auditor_certified = false;
    auditor.scenarios_failed += moduleCoverage.gaps.length;
  }

  const health = computeBillingHealthScore(readiness.modules, auditor);
  const stress = await runStressValidation();
  const certification = buildProductionCertification({ readiness, auditor, health, stress, legacyCycles });
  const summary = buildProductionValidationSummary({
    startedAt: started,
    readiness,
    auditor,
    health,
    stress,
    certification,
  });

  const snapshot = {
    sprint: '4.2A',
    generated_at_iso: new Date().toISOString(),
    status: certification.status,
    billing_health_score: health.billing_health_score,
    deployment_ready: certification.deployment_ready,
    readiness_summary: readiness.summary,
    legacy_cycle_recovery: {
      certified: legacyCycles.certified,
      false_cancelled_detected: legacyCycles.metrics.false_cancelled_detected,
      repaired: legacyCycles.metrics.repaired,
    },
    health,
    stress_invariants: stress.invariants,
    certification,
    artifact_modules: readiness.artifact_paths,
  };

  const artifact_paths: Record<string, string> = {
    ...readiness.artifact_paths,
    [LEGACY_CYCLE_RECOVERY_ARTIFACT]: `${outputDir}/${LEGACY_CYCLE_RECOVERY_ARTIFACT}`,
    'production-validation.json': writeAuditArtifact('production-validation.json', summary, outputDir),
    'auditor-certification.json': writeAuditArtifact('auditor-certification.json', auditor, outputDir),
    'health-score.json': writeAuditArtifact('health-score.json', health, outputDir),
    'production-health-score.json': writeAuditArtifact('production-health-score.json', health, outputDir),
    'deployment-certification.json': writeAuditArtifact(
      'deployment-certification.json',
      certification,
      outputDir
    ),
    'production-certification.json': writeAuditArtifact(
      'production-certification.json',
      certification,
      outputDir
    ),
    'production-ready-snapshot.json': writeAuditArtifact(
      'production-ready-snapshot.json',
      snapshot,
      outputDir
    ),
  };

  return {
    summary,
    readiness,
    auditor,
    health,
    stress,
    certification,
    artifact_paths,
  };
}
