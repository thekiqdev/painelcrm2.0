import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildStageSummaries,
  collectCertificationFailures,
  resolveCertificationDecision,
} from './certificationScorer.js';
import { resetCertificationMetricsForTests } from './certificationMetrics.js';
import type { CertificationStageSummaries } from './types.js';

function perfectStages(): CertificationStageSummaries {
  return buildStageSummaries({
    contextErrors: [],
    contextWarnings: [],
    contextBuildTimeMs: 12,
    projectionScore: 100,
    projectionApproved: true,
    consistencyScore: 100,
    consistencyConfidence: 100,
    consistencyApproved: true,
    shadowScore: 100,
    shadowApproved: true,
    shadowErrorDiffs: 0,
    shadowCriticalDiffs: 0,
    simulatorRecommendation: 'READY_TO_MIGRATE',
    simulatorScore: 100,
    readinessScore: 100,
    readinessReady: true,
    readinessRecommendation: 'READY_TO_MIGRATE',
    cutoverApproved: true,
    cutoverApprovalLevel: 'CUTOVER_PENDING',
    cutoverFeatureFlag: 'ENABLE_V2',
  });
}

describe('billingCertificationScorer', () => {
  beforeEach(() => {
    resetCertificationMetricsForTests();
  });

  it('certifica assinatura perfeita', () => {
    const stages = perfectStages();
    const failures = collectCertificationFailures(stages);
    const decision = resolveCertificationDecision({ stages, failures });

    expect(decision.certified).toBe(true);
    expect(decision.certification_score).toBe(100);
    expect(decision.recommendation).toBe('CERTIFIED');
    expect(failures).toHaveLength(0);
  });

  it('reprova divergência Projection', () => {
    const stages = perfectStages();
    stages.projection.score = 85;
    stages.projection.passed = false;
    stages.projection.approved = false;

    const failures = collectCertificationFailures(stages);
    const decision = resolveCertificationDecision({ stages, failures });

    expect(decision.certified).toBe(false);
    expect(decision.recommendation).toBe('NOT_CERTIFIED');
    expect(failures.some((f) => f.code === 'PROJECTION_NOT_100')).toBe(true);
  });

  it('reprova divergência Shadow', () => {
    const stages = perfectStages();
    stages.shadow.score = 90;
    stages.shadow.passed = false;
    stages.shadow.error_differences = 1;

    const failures = collectCertificationFailures(stages);
    const decision = resolveCertificationDecision({ stages, failures });

    expect(decision.certified).toBe(false);
    expect(failures.some((f) => f.code === 'SHADOW_NOT_100')).toBe(true);
  });

  it('reprova falha Consistency', () => {
    const stages = perfectStages();
    stages.consistency.approved = false;
    stages.consistency.confidence = 80;
    stages.consistency.passed = false;

    const failures = collectCertificationFailures(stages);
    const decision = resolveCertificationDecision({ stages, failures });

    expect(decision.certified).toBe(false);
    expect(failures.some((f) => f.code === 'CONSISTENCY_NOT_APPROVED')).toBe(true);
  });

  it('reprova Readiness bloqueado', () => {
    const stages = perfectStages();
    stages.readiness.ready_for_migration = false;
    stages.readiness.recommendation = 'NOT_READY';
    stages.readiness.passed = false;

    const failures = collectCertificationFailures(stages);
    const decision = resolveCertificationDecision({ stages, failures });

    expect(decision.certified).toBe(false);
    expect(failures.some((f) => f.code === 'READINESS_NOT_READY')).toBe(true);
  });

  it('reprova Simulator bloqueado', () => {
    const stages = perfectStages();
    stages.simulator.recommendation = 'BLOCKED';
    stages.simulator.passed = false;

    const failures = collectCertificationFailures(stages);
    const decision = resolveCertificationDecision({ stages, failures });

    expect(decision.certified).toBe(false);
    expect(failures.some((f) => f.code === 'SIMULATOR_NOT_READY')).toBe(true);
  });

  it('reprova Cutover bloqueado', () => {
    const stages = perfectStages();
    stages.cutover.approved = false;
    stages.cutover.approval_level = 'BLOCKED';
    stages.cutover.feature_flag_recommendation = 'KEEP_V1';
    stages.cutover.passed = false;

    const failures = collectCertificationFailures(stages);
    const decision = resolveCertificationDecision({ stages, failures });

    expect(decision.certified).toBe(false);
    expect(failures.some((f) => f.code === 'CUTOVER_NOT_APPROVED')).toBe(true);
  });

  it('report shape contém snapshots obrigatórios', () => {
    const stages = perfectStages();
    expect(stages.projection).toMatchObject({ score: 100, passed: true });
    expect(stages.consistency).toMatchObject({ confidence: 100, passed: true });
    expect(stages.shadow).toMatchObject({ score: 100, passed: true });
    expect(stages.simulator.recommendation).toBe('READY_TO_MIGRATE');
    expect(stages.cutover.feature_flag_recommendation).toBe('ENABLE_V2');
  });
});
