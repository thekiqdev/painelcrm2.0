/**
 * Billing Engine V2 — Sprint 2.4B: runner de cenário (pipeline READ ONLY).
 */
import { BillingConsistencyValidator } from '../../../billingConsistency/billingConsistencyValidator.js';
import { BillingProjectionEngine } from '../../../billingProjection/billingProjectionEngine.js';
import { normalizeProjectionResult } from '../../../billingProjection/projectionNormalizer.js';
import { renewalComparisonService } from '../billingShadow/renewalComparisonService.js';
import { analyzeMigrationImpact } from '../billingMigrationSimulator/impactAnalyzer.js';
import { resolveSimulationRecommendation } from '../billingMigrationSimulator/recommendationEngine.js';
import {
  buildStageSummaries,
  collectCertificationFailures,
  resolveCertificationDecision,
} from '../billingCertification/certificationScorer.js';
import type { BillingExecutionContext } from '../../../billingExecutionContext/types.js';
import type { GoldenScenarioDef, ScenarioPipelineResult } from './types.js';
import { buildScenarioContextForDef } from './billingScenarioFactory.js';
import { allAssertionsPassed, runScenarioAssertions } from './billingScenarioAssertions.js';
import { perfectCutoverForLab, perfectReadinessForLab, perfectSimulatorForLab } from './labTenantGates.js';

const consistencyValidator = new BillingConsistencyValidator();

export function runScenarioPipeline(
  scenario: GoldenScenarioDef,
  contextOverride?: BillingExecutionContext
): ScenarioPipelineResult {
  const started = Date.now();
  const errors: string[] = [];

  try {
    const context = contextOverride ?? buildScenarioContextForDef(scenario);

    const projection = BillingProjectionEngine.project({ context, skipCache: true });
    const consistency = consistencyValidator.validateFromContext(context);
    const projectedNormalized = normalizeProjectionResult(projection);
    const shadow = renewalComparisonService.compareWithProjection(projectedNormalized, projection);

    const impact = analyzeMigrationImpact({
      legacy: projectedNormalized,
      projectedNormalized,
      projectedInvoice: projection.projectedInvoice,
      comparison: shadow,
    });

    const simulatorRecommendation = resolveSimulationRecommendation({
      overallScore: impact.score,
      impact,
      consistencyApproved: consistency.approved,
      hasSubscriptions: true,
    });

    const readiness = perfectReadinessForLab();
    const simulator = perfectSimulatorForLab();
    const cutover = perfectCutoverForLab();

    const shadowErrorDiffs = shadow.differences.filter((d) => d.severity === 'ERROR').length;
    const shadowCriticalDiffs = shadow.differences.filter((d) => d.severity === 'CRITICAL').length;

    const stages = buildStageSummaries({
      contextErrors: context.diagnostics.errors,
      contextWarnings: context.diagnostics.warnings,
      contextBuildTimeMs: context.diagnostics.contextBuildTime,
      projectionScore: shadow.score,
      projectionApproved: projection.approved && shadow.score === 100,
      consistencyScore: consistency.score,
      consistencyConfidence: consistency.confidence,
      consistencyApproved: consistency.approved,
      shadowScore: shadow.score,
      shadowApproved: shadow.approved,
      shadowErrorDiffs,
      shadowCriticalDiffs,
      simulatorRecommendation,
      simulatorScore: impact.score,
      readinessScore: readiness.overallScore,
      readinessReady: readiness.readyForMigration,
      readinessRecommendation: readiness.migrationRecommendation,
      cutoverApproved: cutover.approved,
      cutoverApprovalLevel: cutover.approvalLevel,
      cutoverFeatureFlag: cutover.featureFlagRecommendation,
    });

    const failures = collectCertificationFailures(stages);
    const certificationDecision = resolveCertificationDecision({ stages, failures });

    const certification = {
      certified: certificationDecision.certified,
      score: certificationDecision.certification_score,
      recommendation: certificationDecision.recommendation,
    };

    const assertions = runScenarioAssertions({
      context,
      projection,
      consistency,
      shadow,
      simulatorRecommendation,
      cutover,
      certification,
    });

    const passed = allAssertionsPassed(assertions) && certification.certified;

    return {
      scenario,
      context,
      projection,
      consistency,
      shadow,
      simulatorRecommendation,
      cutover,
      certification,
      assertions,
      passed,
      duration_ms: Date.now() - started,
      errors,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    return {
      scenario,
      context: contextOverride ?? buildScenarioContextForDef(scenario),
      projection: null as never,
      consistency: null as never,
      shadow: null as never,
      simulatorRecommendation: 'DO_NOT_MIGRATE',
      cutover: perfectCutoverForLab(),
      certification: { certified: false, score: 0, recommendation: 'NOT_CERTIFIED' },
      assertions: [{ name: 'pipeline_exception', passed: false, message: msg }],
      passed: false,
      duration_ms: Date.now() - started,
      errors,
    };
  }
}
