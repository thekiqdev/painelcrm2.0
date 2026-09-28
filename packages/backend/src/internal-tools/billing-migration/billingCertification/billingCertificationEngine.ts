/**
 * Billing Engine V2 — Sprint 2.4A: Certification Suite Engine (READ ONLY).
 */
import { randomUUID } from 'node:crypto';
import { pool } from '../../../utils/db.js';
import { billingExecutionContextBuilder } from '../../../billingExecutionContext/billingExecutionContextBuilder.js';
import { BillingConsistencyValidator } from '../../../billingConsistency/billingConsistencyValidator.js';
import { BillingProjectionEngine } from '../../../billingProjection/billingProjectionEngine.js';
import { normalizeLegacyRenewal } from '../billingShadow/legacyRenewalNormalizer.js';
import { renewalComparisonService } from '../billingShadow/renewalComparisonService.js';
import { evaluateTenantMigrationReadiness } from '../billingMigrationReadiness/billingMigrationReadinessService.js';
import { runMigrationSimulation } from '../billingMigrationSimulator/billingMigrationSimulatorService.js';
import { BillingCutoverOrchestrator } from '../billingCutover/billingCutoverOrchestrator.js';
import { analyzeMigrationImpact } from '../billingMigrationSimulator/impactAnalyzer.js';
import { resolveSimulationRecommendation } from '../billingMigrationSimulator/recommendationEngine.js';
import { normalizeProjectionResult } from '../../../billingProjection/projectionNormalizer.js';
import type { SubscriptionRow } from '../../../services/billingSubscriptionService.js';
import {
  buildStageSummaries,
  collectCertificationFailures,
  collectCertificationWarnings,
  resolveCertificationDecision,
} from './certificationScorer.js';
import {
  logCertification,
  logCertificationFailed,
  logCertificationResult,
  logCertificationStage,
} from './certificationLogger.js';
import { recordCertificationRun } from './certificationMetrics.js';
import type {
  BillingCertificationReport,
  TenantCertificationGates,
} from './types.js';
import { CERTIFICATION_SUITE_VERSION } from './types.js';

const consistencyValidator = new BillingConsistencyValidator();

async function loadActiveCustomerSubscriptions(): Promise<SubscriptionRow[]> {
  const r = await pool.query<SubscriptionRow>(
    `SELECT * FROM subscriptions
     WHERE type = 'customer' AND status = 'active'
     ORDER BY tenant_id, next_billing_date ASC NULLS LAST`
  );
  return r.rows;
}

async function loadLatestInvoiceId(
  subscriptionId: string,
  tenantId: string
): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM customer_invoices
     WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid
     ORDER BY created_at DESC LIMIT 1`,
    [subscriptionId, tenantId]
  );
  return r.rows[0]?.id ?? null;
}

function deriveCycleKey(subscription: SubscriptionRow): string {
  return (
    subscription.current_period_start?.slice(0, 10) ||
    subscription.next_billing_date?.slice(0, 10) ||
    new Date().toISOString().slice(0, 10)
  );
}

async function loadTenantGates(
  tenantId: string,
  correlationId: string
): Promise<TenantCertificationGates> {
  const [readiness, simulator, cutoverReport] = await Promise.all([
    evaluateTenantMigrationReadiness(tenantId, { persist: false }),
    runMigrationSimulation(tenantId, {
      correlationId,
      persist: false,
      skipProjectionCache: true,
    }),
    BillingCutoverOrchestrator.evaluateTenant({
      tenantId,
      correlationId,
      persistUpstream: false,
    }),
  ]);

  return {
    readiness,
    simulator,
    cutover: { decision: cutoverReport.decision },
  };
}

export class BillingCertificationEngine {
  static async certifySubscription(params: {
    subscription: SubscriptionRow;
    correlationId?: string;
    tenantGates?: TenantCertificationGates;
  }): Promise<BillingCertificationReport> {
    const started = Date.now();
    const { subscription } = params;
    const tenantId = subscription.tenant_id;
    const correlationId = params.correlationId ?? randomUUID();
    const cycleKey = deriveCycleKey(subscription);
    const logBase = {
      tenant_id: tenantId,
      subscription_id: subscription.id,
      correlation_id: correlationId,
    };

    logCertification('start', logBase);

    const tenantGates =
      params.tenantGates ?? (await loadTenantGates(tenantId, correlationId));

    const executionContext = await billingExecutionContextBuilder.build({
      subscriptionId: subscription.id,
      tenantId,
      cycleKey,
      periodStartYmd: cycleKey,
      correlationId,
      executionMode: 'api',
      skipCache: true,
    });

    logCertificationStage({
      ...logBase,
      stage: 'context',
      duration_ms: executionContext.diagnostics.contextBuildTime,
    });

    const projection = BillingProjectionEngine.project({
      context: executionContext,
      skipCache: true,
    });

    const consistency = consistencyValidator.validateFromContext(executionContext);

    logCertificationStage({
      ...logBase,
      stage: 'consistency',
      score: consistency.score,
      duration_ms: 0,
    });

    const projectedNormalized = normalizeProjectionResult(projection);
    const invoiceId = await loadLatestInvoiceId(subscription.id, tenantId);
    const legacy = await normalizeLegacyRenewal({
      subscription,
      cycleKey,
      periodStartYmd: cycleKey,
      renewalResult: {
        invoiceId,
        success: Boolean(invoiceId),
        correlationId,
        cycleKey,
        executionMode: 'api',
        gatewayStatus: null,
        notificationStatus: 'skipped',
        timelineStatus: 'ok',
        historyStatus: 'ok',
        subscriptionAdvanced: false,
        completionOutcome: null,
        executionTime: 0,
        logs: [],
      },
    });

    const comparison = renewalComparisonService.compareWithProjection(
      legacy.normalized,
      projection
    );

    logCertificationStage({
      ...logBase,
      stage: 'projection',
      score: comparison.score,
      duration_ms: projection.duration,
    });

    logCertificationStage({
      ...logBase,
      stage: 'shadow',
      score: comparison.score,
      duration_ms: comparison.comparison_time_ms,
    });

    const impact = analyzeMigrationImpact({
      legacy: legacy.normalized,
      projectedNormalized,
      projectedInvoice: projection.projectedInvoice,
      comparison,
      logContext: { ...logBase, cycle_key: cycleKey },
    });

    const sliceRecommendation = resolveSimulationRecommendation({
      overallScore: impact.score,
      impact,
      consistencyApproved: consistency.approved,
      hasSubscriptions: true,
    });

    logCertificationStage({
      ...logBase,
      stage: 'simulator',
      score: impact.score,
    });

    const shadowErrorDiffs = comparison.differences.filter(
      (d) => d.severity === 'ERROR'
    ).length;
    const shadowCriticalDiffs = comparison.differences.filter(
      (d) => d.severity === 'CRITICAL'
    ).length;

    const slice = tenantGates.simulator.subscriptions.find(
      (s) => s.subscription_id === subscription.id
    );

    const stages = buildStageSummaries({
      contextErrors: executionContext.diagnostics.errors,
      contextWarnings: executionContext.diagnostics.warnings,
      contextBuildTimeMs: executionContext.diagnostics.contextBuildTime,
      projectionScore: comparison.score,
      projectionApproved: projection.approved && comparison.score === 100,
      consistencyScore: consistency.score,
      consistencyConfidence: consistency.confidence,
      consistencyApproved: consistency.approved,
      shadowScore: comparison.score,
      shadowApproved: comparison.approved,
      shadowErrorDiffs,
      shadowCriticalDiffs,
      simulatorRecommendation: sliceRecommendation,
      simulatorScore: slice?.impact.score ?? impact.score,
      readinessScore: tenantGates.readiness.overallScore,
      readinessReady: tenantGates.readiness.readyForMigration,
      readinessRecommendation: tenantGates.readiness.migrationRecommendation,
      cutoverApproved: tenantGates.cutover.decision.approved,
      cutoverApprovalLevel: tenantGates.cutover.decision.approvalLevel,
      cutoverFeatureFlag: tenantGates.cutover.decision.featureFlagRecommendation,
    });

    stages.projection.hash = projection.diagnostics.hash;

    logCertificationStage({ ...logBase, stage: 'readiness', score: tenantGates.readiness.overallScore });
    logCertificationStage({
      ...logBase,
      stage: 'cutover',
      score: tenantGates.cutover.decision.overallScore,
    });

    const failures = collectCertificationFailures(stages);
    const warnings = collectCertificationWarnings(stages);
    const decision = resolveCertificationDecision({ stages, failures });

    const durationMs = Date.now() - started;
    const generatedAt = new Date().toISOString();

    const report: BillingCertificationReport = {
      tenant_id: tenantId,
      subscription_id: subscription.id,
      correlation_id: correlationId,
      certification_score: decision.certification_score,
      certified: decision.certified,
      certified_at: decision.certified ? generatedAt : null,
      recommendation: decision.recommendation,
      projection_summary: stages.projection,
      consistency_summary: stages.consistency,
      shadow_summary: stages.shadow,
      readiness_summary: stages.readiness,
      simulator_summary: stages.simulator,
      cutover_summary: stages.cutover,
      context_summary: stages.context,
      failures,
      warnings,
      generated_at: generatedAt,
      execution_time_ms: durationMs,
      diagnostics: {
        engine_version: CERTIFICATION_SUITE_VERSION,
        tenant_gates_evaluated: true,
      },
    };

    if (decision.certified) {
      logCertificationResult({
        ...logBase,
        score: decision.certification_score,
        duration_ms: durationMs,
        certified: true,
        recommendation: decision.recommendation,
      });
    } else {
      for (const failure of failures.filter(
        (f) => f.severity === 'ERROR' || f.severity === 'CRITICAL'
      )) {
        logCertificationFailed({
          ...logBase,
          score: decision.certification_score,
          duration_ms: durationMs,
          code: failure.code,
        });
      }
      logCertificationResult({
        ...logBase,
        score: decision.certification_score,
        duration_ms: durationMs,
        certified: false,
        recommendation: decision.recommendation,
      });
    }

    recordCertificationRun({
      certified: decision.certified,
      score: decision.certification_score,
    });

    return report;
  }

  static async runFullCertification(params?: {
    correlationId?: string;
  }): Promise<{
    reports: BillingCertificationReport[];
    engine_certified: boolean;
    recommendation: 'CERTIFIED' | 'NOT_CERTIFIED';
    correlation_id: string;
  }> {
    const correlationId = params?.correlationId ?? randomUUID();
    const subscriptions = await loadActiveCustomerSubscriptions();
    const tenantGatesCache = new Map<string, TenantCertificationGates>();
    const reports: BillingCertificationReport[] = [];

    for (const subscription of subscriptions) {
      let gates = tenantGatesCache.get(subscription.tenant_id);
      if (!gates) {
        gates = await loadTenantGates(subscription.tenant_id, correlationId);
        tenantGatesCache.set(subscription.tenant_id, gates);
      }

      const report = await this.certifySubscription({
        subscription,
        correlationId,
        tenantGates: gates,
      });
      reports.push(report);
    }

    const engine_certified =
      subscriptions.length > 0 && reports.every((r) => r.certified);
    const recommendation = engine_certified ? 'CERTIFIED' : 'NOT_CERTIFIED';

    recordCertificationRun({
      certified: engine_certified,
      score: engine_certified
        ? 100
        : reports.length > 0
          ? Math.round(
              reports.reduce((s, r) => s + r.certification_score, 0) / reports.length
            )
          : 0,
      engineCertified: engine_certified,
      totalSubscriptions: subscriptions.length,
    });

    logCertification('suite_complete', {
      tenant_id: 'global',
      correlation_id: correlationId,
      score: engine_certified ? 100 : 0,
      certified: engine_certified,
      recommendation,
    });

    return {
      reports,
      engine_certified,
      recommendation,
      correlation_id: correlationId,
    };
  }
}
