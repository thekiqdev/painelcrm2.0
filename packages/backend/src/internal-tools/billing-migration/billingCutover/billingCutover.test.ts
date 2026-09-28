import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateCutoverPolicy } from './billingCutoverPolicy.js';
import { buildCutoverDecision } from './billingCutoverDecision.js';
import {
  buildRollbackStrategy,
  resolveFeatureFlagRecommendation,
  resolveRecommendedAction,
} from './billingRollbackStrategy.js';
import { resetCutoverMetricsForTests } from './cutoverMetrics.js';
import type { BillingMigrationReadinessReport } from '../billingMigrationReadiness/types.js';
import type { BillingMigrationSimulationReport } from '../billingMigrationSimulator/types.js';

function perfectReadiness(): BillingMigrationReadinessReport {
  return {
    tenantId: 't1',
    overallScore: 100,
    approved: true,
    approvalLevel: 'READY',
    readyForMigration: true,
    migrationRecommendation: 'READY_TO_MIGRATE',
    blockingIssues: [],
    warnings: [],
    criticalIssues: [],
    areaScores: [
      { area: 'shadow', weight: 25, score: 100, passed: true },
      { area: 'projection', weight: 20, score: 100, passed: true },
      { area: 'consistency', weight: 20, score: 100, passed: true },
      { area: 'billing_plans', weight: 10, score: 100, passed: true },
      { area: 'billing_items', weight: 10, score: 100, passed: true },
      { area: 'jobs', weight: 5, score: 100, passed: true },
      { area: 'gateway', weight: 5, score: 100, passed: true },
      { area: 'notifications', weight: 5, score: 100, passed: true },
    ],
    statistics: {
      subscriptions_total: 1,
      subscriptions_evaluated: 1,
      shadow_reports: 1,
      consistency_reports: 1,
      plans_total: 1,
      items_total: 1,
      jobs_pending: 0,
      jobs_failed: 0,
      jobs_stuck: 0,
    },
    shadowSummary: { avg_score: 100 },
    projectionSummary: { avg_score: 100 },
    consistencySummary: { avg_score: 100 },
    engineHealthSummary: {},
    diagnostics: { evaluation_ms: 1, engine_version: 'v1', areas_evaluated: [], data_sources: [] },
    generatedAt: new Date().toISOString(),
  };
}

function perfectSimulator(): BillingMigrationSimulationReport {
  return {
    tenant_id: 't1',
    tenant_name: 'Acme',
    correlation_id: 'corr',
    subscriptions: [],
    impact: {
      identical: true,
      score: 100,
      risk: 'NONE',
      differences: [],
      financialImpact: {
        legacy_total_cents: 100,
        projected_total_cents: 100,
        difference_cents: 0,
        difference_percent: 0,
        subtotal_delta: 0,
        discounts_delta: 0,
        taxes_delta: 0,
      },
      itemChanges: [],
      notificationImpact: { would_dispatch: false, templates: [], recipients: [], variables: {} },
      gatewayImpact: {
        identical: true,
        provider: null,
        currency: 'BRL',
        fees_delta: 0,
        payment_method_match: true,
        payload_diff_fields: [],
      },
      timelineImpact: {
        identical: true,
        expected_events: [],
        legacy_events: [],
        order_match: true,
      },
      historyImpact: { identical: true, expected_changes: [], legacy_changes: [] },
      jobsImpact: {
        expected_job: false,
        scheduler_would_enqueue: false,
        worker_would_process: false,
        retry_expected: false,
        notes: [],
      },
    },
    comparison: null,
    projection: null,
    consistency: null,
    shadow: null,
    overall_score: 100,
    recommended: 'READY_TO_MIGRATE',
    rollback_safe: true,
    rollback_preview: { rollback_possible: true, rollback_steps: ['step1'], notes: [] },
    generated_at: new Date().toISOString(),
    diagnostics: { duration_ms: 1, engine_version: 'v1', subscriptions_simulated: 0 },
  };
}

describe('billingCutoverPolicy', () => {
  it('aprova quando todos critérios atendidos', () => {
    const result = evaluateCutoverPolicy({
      readiness: perfectReadiness(),
      simulator: perfectSimulator(),
      shadowScore: 100,
      projectionScore: 100,
      consistencyApproved: true,
    });
    expect(result.approved).toBe(true);
    expect(result.approvalLevel).toBe('CUTOVER_PENDING');
    expect(result.blockingIssues.filter((i) => i.severity === 'CRITICAL')).toHaveLength(0);
  });

  it('bloqueia quando shadow score baixo', () => {
    const result = evaluateCutoverPolicy({
      readiness: { ...perfectReadiness(), readyForMigration: false },
      simulator: perfectSimulator(),
      shadowScore: 80,
      projectionScore: 100,
      consistencyApproved: true,
    });
    expect(result.approved).toBe(false);
    expect(result.blockingIssues.some((i) => i.code === 'SHADOW_SCORE_NOT_100')).toBe(true);
  });

  it('bloqueia quando simulator não READY_TO_MIGRATE', () => {
    const result = evaluateCutoverPolicy({
      readiness: perfectReadiness(),
      simulator: { ...perfectSimulator(), recommended: 'BLOCKED' },
      shadowScore: 100,
      projectionScore: 100,
      consistencyApproved: true,
    });
    expect(result.approved).toBe(false);
    expect(result.blockingIssues.some((i) => i.code === 'SIMULATOR_NOT_READY')).toBe(true);
  });
});

describe('billingCutoverDecision', () => {
  beforeEach(() => resetCutoverMetricsForTests());

  it('monta decisão com feature flag ENABLE_V2 quando aprovado', () => {
    const decision = buildCutoverDecision({
      tenantId: 't1',
      correlationId: 'corr',
      readiness: perfectReadiness(),
      simulator: perfectSimulator(),
      shadowScore: 100,
      projectionScore: 100,
      consistencyApproved: true,
    });
    expect(decision.approved).toBe(true);
    expect(decision.featureFlagRecommendation).toBe('ENABLE_V2');
    expect(decision.recommendedAction).toBe('EXECUTE_CUTOVER_SPRINT_2_4');
    expect(decision.rollbackPlan.rollback_safe).toBe(true);
  });
});

describe('billingRollbackStrategy', () => {
  it('rollback strategy documenta passos', () => {
    const policy = evaluateCutoverPolicy({
      readiness: perfectReadiness(),
      simulator: perfectSimulator(),
      shadowScore: 100,
      projectionScore: 100,
      consistencyApproved: true,
    });
    const strategy = buildRollbackStrategy({ simulator: perfectSimulator(), policy });
    expect(strategy.rollback_safe).toBe(true);
    expect(strategy.rollback_steps.length).toBeGreaterThan(0);
  });

  it('KEEP_V1 quando bloqueado', () => {
    expect(
      resolveFeatureFlagRecommendation({
        approved: false,
        approvalLevel: 'BLOCKED',
        policy: {
          approved: false,
          approvalLevel: 'BLOCKED',
          blockingIssues: [{ code: 'X', severity: 'CRITICAL', source: 'policy', message: 'x' }],
          warnings: [],
          overallScore: 0,
        },
      })
    ).toBe('KEEP_V1');
  });

  it('recommended action FIX_BLOCKERS quando blocked', () => {
    expect(
      resolveRecommendedAction({
        approved: false,
        approvalLevel: 'BLOCKED',
        flagRecommendation: 'KEEP_V1',
      })
    ).toBe('FIX_BLOCKERS');
  });
});

describe('cutover repository contract', () => {
  it('report shape contém snapshots obrigatórios', () => {
    const decision = buildCutoverDecision({
      tenantId: 't1',
      correlationId: 'c',
      readiness: perfectReadiness(),
      simulator: perfectSimulator(),
    });
    expect(decision.overallScore).toBeGreaterThan(0);
    expect(decision.timeline).toBeDefined();
    expect(decision.nextEvaluation).toBeTruthy();
  });
});
