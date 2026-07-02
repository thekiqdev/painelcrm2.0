/**
 * Billing Engine V2 — Sprint 2.3G: Cutover Orchestrator (READ ONLY — somente decisão).
 */
import { randomUUID } from 'node:crypto';
import { pool } from '../../../utils/db.js';
import { evaluateTenantMigrationReadiness } from '../billingMigrationReadiness/billingMigrationReadinessService.js';
import { runMigrationSimulation } from '../billingMigrationSimulator/billingMigrationSimulatorService.js';
import { buildCutoverDecision } from './billingCutoverDecision.js';
import { logCutover } from './cutoverLogger.js';
import { recordCutoverEvaluation } from './cutoverMetrics.js';
import type { BillingCutoverReport } from './types.js';
import { CUTOVER_ORCHESTRATOR_VERSION } from './types.js';

function compactReadinessSnapshot(report: Awaited<ReturnType<typeof evaluateTenantMigrationReadiness>>) {
  return {
    overall_score: report.overallScore,
    approved: report.approved,
    approval_level: report.approvalLevel,
    ready_for_migration: report.readyForMigration,
    recommendation: report.migrationRecommendation,
    area_scores: report.areaScores,
    shadow_summary: report.shadowSummary,
    projection_summary: report.projectionSummary,
    consistency_summary: report.consistencySummary,
  };
}

function compactSimulatorSnapshot(report: Awaited<ReturnType<typeof runMigrationSimulation>>) {
  return {
    overall_score: report.overall_score,
    recommended: report.recommended,
    rollback_safe: report.rollback_safe,
    risk: report.impact.risk,
    financial_impact: report.impact.financialImpact,
    subscriptions_count: report.subscriptions.length,
  };
}

function compactProjectionSnapshot(simulator: Awaited<ReturnType<typeof runMigrationSimulation>>) {
  const first = simulator.subscriptions[0];
  if (!first) return { has_projection: false };
  return {
    has_projection: true,
    grand_total: first.projected_invoice.grandTotal,
    hash: first.projection.diagnostics.hash,
    score: first.comparison.score,
    approved: first.comparison.approved,
  };
}

function compactConsistencySnapshot(simulator: Awaited<ReturnType<typeof runMigrationSimulation>>) {
  const first = simulator.subscriptions[0];
  if (!first) return { has_consistency: false };
  return {
    has_consistency: true,
    approved: first.consistency.approved,
    confidence: first.consistency.confidence,
    score: first.consistency.score,
    error_count: first.consistency.errors.length,
  };
}

function compactShadowSnapshot(
  readiness: Awaited<ReturnType<typeof evaluateTenantMigrationReadiness>>,
  simulator: Awaited<ReturnType<typeof runMigrationSimulation>>
) {
  const shadowArea = readiness.areaScores.find((a) => a.area === 'shadow');
  const subShadow = simulator.subscriptions[0]?.shadow_summary;
  return {
    readiness_shadow_score: shadowArea?.score ?? null,
    simulator_shadow: subShadow,
    avg_comparison_score:
      simulator.subscriptions.length > 0
        ? Math.round(
            simulator.subscriptions.reduce((s, x) => s + x.comparison.score, 0) /
              simulator.subscriptions.length
          )
        : null,
  };
}

export class BillingCutoverOrchestrator {
  /**
   * Orquestra avaliação de cutover consumindo Readiness + Simulator (sem recalcular regras).
   */
  static async evaluateTenant(params: {
    tenantId: string;
    correlationId?: string;
    persistUpstream?: boolean;
  }): Promise<BillingCutoverReport> {
    const started = Date.now();
    const correlationId = params.correlationId ?? randomUUID();
    const logCtx = { tenant_id: params.tenantId, correlation_id: correlationId };

    logCutover('start', logCtx);

    const tenantRow = await pool.query<{ company_name: string | null }>(
      `SELECT company_name FROM tenants WHERE id = $1::uuid LIMIT 1`,
      [params.tenantId]
    );
    const tenantName = tenantRow.rows[0]?.company_name ?? null;

    const persistUpstream = params.persistUpstream !== false;

    const [readiness, simulator] = await Promise.all([
      evaluateTenantMigrationReadiness(params.tenantId, { persist: persistUpstream }),
      runMigrationSimulation(params.tenantId, {
        correlationId,
        persist: persistUpstream,
        skipProjectionCache: true,
      }),
    ]);

    const shadowScore = readiness.areaScores.find((a) => a.area === 'shadow')?.score ?? null;
    const projectionScore = readiness.areaScores.find((a) => a.area === 'projection')?.score ?? null;
    const consistencyApproved = readiness.areaScores.find((a) => a.area === 'consistency')?.passed;

    const decision = buildCutoverDecision({
      tenantId: params.tenantId,
      correlationId,
      readiness,
      simulator,
      shadowScore,
      projectionScore,
      consistencyApproved,
    });

    const durationMs = Date.now() - started;

    const report: BillingCutoverReport = {
      tenant_id: params.tenantId,
      tenant_name: tenantName,
      correlation_id: correlationId,
      decision,
      readiness_snapshot: compactReadinessSnapshot(readiness),
      simulator_snapshot: compactSimulatorSnapshot(simulator),
      projection_snapshot: compactProjectionSnapshot(simulator),
      consistency_snapshot: compactConsistencySnapshot(simulator),
      shadow_snapshot: compactShadowSnapshot(readiness, simulator),
      generated_at: new Date().toISOString(),
      diagnostics: {
        duration_ms: durationMs,
        engine_version: CUTOVER_ORCHESTRATOR_VERSION,
      },
    };

    logCutover('complete', {
      ...logCtx,
      duration_ms: durationMs,
      approval_level: decision.approvalLevel,
      recommendation: decision.featureFlagRecommendation,
      approved: decision.approved,
    });

    recordCutoverEvaluation({
      approved: decision.approved,
      overallScore: decision.overallScore,
      rollbackSafe: decision.rollbackPlan.rollback_safe,
      isCandidate: decision.approvalLevel === 'CUTOVER_PENDING' || decision.approvalLevel === 'APPROVED',
    });

    return report;
  }
}
