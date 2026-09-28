/**
 * Billing Engine V2 — Sprint 2.4A: agregação determinística da decisão de certificação.
 * Não recalcula regras — apenas consolida resultados dos módulos upstream.
 */
import type {
  CertificationFailure,
  CertificationRecommendation,
  CertificationStageSummaries,
} from './types.js';

export function buildStageSummaries(params: {
  contextErrors: string[];
  contextWarnings: string[];
  contextBuildTimeMs: number;
  projectionScore: number;
  projectionApproved: boolean;
  consistencyScore: number;
  consistencyConfidence: number;
  consistencyApproved: boolean;
  shadowScore: number;
  shadowApproved: boolean;
  shadowErrorDiffs: number;
  shadowCriticalDiffs: number;
  simulatorRecommendation: CertificationStageSummaries['simulator']['recommendation'];
  simulatorScore: number;
  readinessScore: number;
  readinessReady: boolean;
  readinessRecommendation: string;
  cutoverApproved: boolean;
  cutoverApprovalLevel: string;
  cutoverFeatureFlag: string;
}): CertificationStageSummaries {
  const contextPassed =
    params.contextErrors.length === 0 && params.contextWarnings.length === 0;
  const projectionPassed = params.projectionScore === 100 && params.projectionApproved;
  const consistencyPassed =
    params.consistencyApproved && params.consistencyConfidence === 100 && params.consistencyScore === 100;
  const shadowPassed =
    params.shadowApproved &&
    params.shadowScore === 100 &&
    params.shadowErrorDiffs === 0 &&
    params.shadowCriticalDiffs === 0;
  const simulatorPassed = params.simulatorRecommendation === 'READY_TO_MIGRATE';
  const readinessPassed =
    params.readinessReady && params.readinessRecommendation === 'READY_TO_MIGRATE';
  const cutoverPassed =
    params.cutoverApproved &&
    (params.cutoverApprovalLevel === 'APPROVED' ||
      params.cutoverApprovalLevel === 'CUTOVER_PENDING') &&
    params.cutoverFeatureFlag === 'ENABLE_V2';

  return {
    context: {
      passed: contextPassed,
      errors: params.contextErrors,
      warnings: params.contextWarnings,
      build_time_ms: params.contextBuildTimeMs,
    },
    projection: {
      score: params.projectionScore,
      approved: params.projectionApproved,
      passed: projectionPassed,
      hash: null,
    },
    consistency: {
      score: params.consistencyScore,
      confidence: params.consistencyConfidence,
      approved: params.consistencyApproved,
      passed: consistencyPassed,
    },
    shadow: {
      score: params.shadowScore,
      approved: params.shadowApproved,
      passed: shadowPassed,
      error_differences: params.shadowErrorDiffs,
      critical_differences: params.shadowCriticalDiffs,
    },
    simulator: {
      recommendation: params.simulatorRecommendation,
      passed: simulatorPassed,
      score: params.simulatorScore,
    },
    readiness: {
      overall_score: params.readinessScore,
      ready_for_migration: params.readinessReady,
      recommendation: params.readinessRecommendation,
      passed: readinessPassed,
    },
    cutover: {
      approved: params.cutoverApproved,
      approval_level: params.cutoverApprovalLevel,
      feature_flag_recommendation: params.cutoverFeatureFlag,
      passed: cutoverPassed,
    },
  };
}

export function collectCertificationFailures(stages: CertificationStageSummaries): CertificationFailure[] {
  const failures: CertificationFailure[] = [];

  if (!stages.context.passed) {
    for (const err of stages.context.errors) {
      failures.push({
        code: 'CONTEXT_ERROR',
        stage: 'context',
        severity: 'ERROR',
        message: err,
      });
    }
    for (const warn of stages.context.warnings) {
      failures.push({
        code: 'CONTEXT_WARNING',
        stage: 'context',
        severity: 'WARNING',
        message: warn,
      });
    }
    if (stages.context.errors.length === 0 && stages.context.warnings.length === 0) {
      failures.push({
        code: 'CONTEXT_INVALID',
        stage: 'context',
        severity: 'ERROR',
        message: 'Contexto com dados ausentes ou fallback inesperado',
      });
    }
  }

  if (!stages.projection.passed) {
    failures.push({
      code: 'PROJECTION_NOT_100',
      stage: 'projection',
      severity: stages.projection.score < 50 ? 'CRITICAL' : 'ERROR',
      message: `Projection score ${stages.projection.score}`,
      detail: { approved: stages.projection.approved },
    });
  }

  if (!stages.consistency.passed) {
    failures.push({
      code: 'CONSISTENCY_NOT_APPROVED',
      stage: 'consistency',
      severity: 'ERROR',
      message: `Consistency score ${stages.consistency.score}, confidence ${stages.consistency.confidence}`,
      detail: { approved: stages.consistency.approved },
    });
  }

  if (!stages.shadow.passed) {
    failures.push({
      code: 'SHADOW_NOT_100',
      stage: 'shadow',
      severity:
        stages.shadow.critical_differences > 0
          ? 'CRITICAL'
          : stages.shadow.error_differences > 0
            ? 'ERROR'
            : 'ERROR',
      message: `Shadow score ${stages.shadow.score}`,
      detail: {
        approved: stages.shadow.approved,
        error_differences: stages.shadow.error_differences,
        critical_differences: stages.shadow.critical_differences,
      },
    });
  }

  if (!stages.simulator.passed) {
    failures.push({
      code: 'SIMULATOR_NOT_READY',
      stage: 'simulator',
      severity:
        stages.simulator.recommendation === 'DO_NOT_MIGRATE' ||
        stages.simulator.recommendation === 'BLOCKED'
          ? 'CRITICAL'
          : 'ERROR',
      message: `Simulator recommendation ${stages.simulator.recommendation}`,
    });
  }

  if (!stages.readiness.passed) {
    failures.push({
      code: 'READINESS_NOT_READY',
      stage: 'readiness',
      severity: 'ERROR',
      message: `Readiness ${stages.readiness.recommendation}`,
      detail: { ready_for_migration: stages.readiness.ready_for_migration },
    });
  }

  if (!stages.cutover.passed) {
    failures.push({
      code: 'CUTOVER_NOT_APPROVED',
      stage: 'cutover',
      severity: 'ERROR',
      message: `Cutover ${stages.cutover.approval_level} / ${stages.cutover.feature_flag_recommendation}`,
      detail: { approved: stages.cutover.approved },
    });
  }

  return failures;
}

export function collectCertificationWarnings(stages: CertificationStageSummaries): CertificationFailure[] {
  const warnings: CertificationFailure[] = [];
  for (const warn of stages.context.warnings) {
    if (stages.context.passed) {
      warnings.push({
        code: 'CONTEXT_WARNING',
        stage: 'context',
        severity: 'WARNING',
        message: warn,
      });
    }
  }
  return warnings;
}

export function computeCertificationScore(stages: CertificationStageSummaries): number {
  if (
    stages.context.passed &&
    stages.projection.passed &&
    stages.consistency.passed &&
    stages.shadow.passed &&
    stages.simulator.passed &&
    stages.readiness.passed &&
    stages.cutover.passed
  ) {
    return 100;
  }

  const base = Math.min(
    stages.projection.score,
    stages.shadow.score,
    stages.consistency.score
  );

  let penalty = 0;
  if (!stages.simulator.passed) penalty += 15;
  if (!stages.readiness.passed) penalty += 20;
  if (!stages.cutover.passed) penalty += 25;
  if (!stages.context.passed) penalty += 30;

  return Math.max(0, Math.round(base - penalty));
}

export function resolveCertificationDecision(params: {
  stages: CertificationStageSummaries;
  failures: CertificationFailure[];
}): { certified: boolean; certification_score: number; recommendation: CertificationRecommendation } {
  const certification_score = computeCertificationScore(params.stages);
  const hasBlocking =
    params.failures.some((f) => f.severity === 'ERROR' || f.severity === 'CRITICAL') ||
    !params.stages.projection.passed ||
    !params.stages.shadow.passed ||
    !params.stages.consistency.passed ||
    !params.stages.simulator.passed ||
    !params.stages.readiness.passed ||
    !params.stages.cutover.passed ||
    !params.stages.context.passed;

  const certified = !hasBlocking && certification_score === 100;
  return {
    certified,
    certification_score: certified ? 100 : certification_score,
    recommendation: certified ? 'CERTIFIED' : 'NOT_CERTIFIED',
  };
}
