/**
 * Billing Engine V2 — Sprint 2.3F: Migration Simulator Engine (READ ONLY).
 */
import { randomUUID } from 'node:crypto';
import { pool } from '../../../utils/db.js';
import { billingExecutionContextBuilder } from '../../../billingExecutionContext/billingExecutionContextBuilder.js';
import { BillingConsistencyValidator } from '../../../billingConsistency/billingConsistencyValidator.js';
import { BillingProjectionEngine } from '../../../billingProjection/billingProjectionEngine.js';
import { normalizeProjectionResult } from '../../../billingProjection/projectionNormalizer.js';
import { billingShadowReportRepository } from '../billingShadow/billingShadowReportRepository.js';
import { normalizeLegacyRenewal } from '../billingShadow/legacyRenewalNormalizer.js';
import { renewalComparisonService } from '../billingShadow/renewalComparisonService.js';
import type { SubscriptionRow } from '../../../services/billingSubscriptionService.js';
import { analyzeMigrationImpact } from './impactAnalyzer.js';
import { buildRollbackPreview, isRollbackSafe } from './rollbackPreview.js';
import { resolveSimulationRecommendation } from './recommendationEngine.js';
import { logMigrationImpact, logMigrationReport, logMigrationSimulator } from './simulatorLogger.js';
import { recordSimulationRun } from './simulatorMetrics.js';
import type {
  BillingMigrationSimulationReport,
  MigrationImpact,
  SubscriptionSimulationSlice,
} from './types.js';
import { MIGRATION_SIMULATOR_ENGINE_VERSION } from './types.js';

const consistencyValidator = new BillingConsistencyValidator();

async function loadCustomerSubscriptions(tenantId: string): Promise<SubscriptionRow[]> {
  const r = await pool.query<SubscriptionRow>(
    `SELECT * FROM subscriptions
     WHERE tenant_id = $1::uuid AND type = 'customer' AND status = 'active'
     ORDER BY next_billing_date ASC NULLS LAST`,
    [tenantId]
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

function aggregateImpact(slices: SubscriptionSimulationSlice[]): MigrationImpact {
  if (slices.length === 0) {
    return {
      identical: false,
      score: 0,
      risk: 'CRITICAL',
      differences: [],
      financialImpact: {
        legacy_total_cents: 0,
        projected_total_cents: 0,
        difference_cents: 0,
        difference_percent: null,
        subtotal_delta: 0,
        discounts_delta: 0,
        taxes_delta: 0,
      },
      itemChanges: [],
      notificationImpact: {
        would_dispatch: false,
        templates: [],
        recipients: [],
        variables: {},
      },
      gatewayImpact: {
        identical: true,
        provider: null,
        currency: null,
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
      historyImpact: {
        identical: true,
        expected_changes: [],
        legacy_changes: [],
      },
      jobsImpact: {
        expected_job: false,
        scheduler_would_enqueue: false,
        worker_would_process: false,
        retry_expected: false,
        notes: ['Nenhuma assinatura ativa'],
      },
    };
  }

  const avgScore = Math.round(
    slices.reduce((sum, s) => sum + s.impact.score, 0) / slices.length
  );
  const worstRisk = slices.reduce((worst, s) => {
    const order = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return order.indexOf(s.impact.risk) > order.indexOf(worst) ? s.impact.risk : worst;
  }, 'NONE' as MigrationImpact['risk']);

  const allDiffs = slices.flatMap((s) => s.impact.differences);
  const allItems = slices.flatMap((s) => s.impact.itemChanges);
  const fin = slices.reduce(
    (acc, s) => ({
      legacy_total_cents: acc.legacy_total_cents + s.impact.financialImpact.legacy_total_cents,
      projected_total_cents:
        acc.projected_total_cents + s.impact.financialImpact.projected_total_cents,
      difference_cents: acc.difference_cents + s.impact.financialImpact.difference_cents,
      subtotal_delta: acc.subtotal_delta + s.impact.financialImpact.subtotal_delta,
      discounts_delta: acc.discounts_delta + s.impact.financialImpact.discounts_delta,
      taxes_delta: acc.taxes_delta + s.impact.financialImpact.taxes_delta,
    }),
    {
      legacy_total_cents: 0,
      projected_total_cents: 0,
      difference_cents: 0,
      subtotal_delta: 0,
      discounts_delta: 0,
      taxes_delta: 0,
    }
  );

  return {
    identical: slices.every((s) => s.impact.identical),
    score: avgScore,
    risk: worstRisk,
    differences: allDiffs,
    financialImpact: {
      ...fin,
      difference_percent:
        fin.legacy_total_cents > 0
          ? Math.round((fin.difference_cents / fin.legacy_total_cents) * 10000) / 100
          : null,
    },
    itemChanges: allItems,
    notificationImpact: slices[0]?.impact.notificationImpact ?? {
      would_dispatch: false,
      templates: [],
      recipients: [],
      variables: {},
    },
    gatewayImpact: slices[0]?.impact.gatewayImpact ?? {
      identical: true,
      provider: null,
      currency: null,
      fees_delta: 0,
      payment_method_match: true,
      payload_diff_fields: [],
    },
    timelineImpact: slices[0]?.impact.timelineImpact ?? {
      identical: true,
      expected_events: [],
      legacy_events: [],
      order_match: true,
    },
    historyImpact: slices[0]?.impact.historyImpact ?? {
      identical: true,
      expected_changes: [],
      legacy_changes: [],
    },
    jobsImpact: {
      expected_job: slices.some((s) => s.impact.jobsImpact.expected_job),
      scheduler_would_enqueue: slices.some((s) => s.impact.jobsImpact.scheduler_would_enqueue),
      worker_would_process: slices.some((s) => s.impact.jobsImpact.worker_would_process),
      retry_expected: false,
      notes: ['Simulação agregada por tenant'],
    },
  };
}

export class BillingMigrationSimulatorEngine {
  static async simulateTenant(params: {
    tenantId: string;
    correlationId?: string;
    skipProjectionCache?: boolean;
  }): Promise<BillingMigrationSimulationReport> {
    const started = Date.now();
    const correlationId = params.correlationId ?? randomUUID();
    const logCtx = { tenant_id: params.tenantId, correlation_id: correlationId };

    logMigrationSimulator('start', logCtx);

    const tenantRow = await pool.query<{ company_name: string | null }>(
      `SELECT company_name FROM tenants WHERE id = $1::uuid LIMIT 1`,
      [params.tenantId]
    );
    const tenantName = tenantRow.rows[0]?.company_name ?? null;

    const subscriptions = await loadCustomerSubscriptions(params.tenantId);
    const slices: SubscriptionSimulationSlice[] = [];

    for (const subscription of subscriptions) {
      const cycleKey = deriveCycleKey(subscription);
      const subLog = { ...logCtx, subscription_id: subscription.id, cycle_key: cycleKey };

      const executionContext = await billingExecutionContextBuilder.build({
        subscriptionId: subscription.id,
        tenantId: params.tenantId,
        cycleKey,
        periodStartYmd: cycleKey,
        correlationId,
        executionMode: 'api',
        skipCache: params.skipProjectionCache,
      });

      const projection = BillingProjectionEngine.project({
        context: executionContext,
        skipCache: params.skipProjectionCache,
      });

      const consistency = consistencyValidator.validateFromContext(executionContext);
      const projectedNormalized = normalizeProjectionResult(projection);

      const invoiceId = await loadLatestInvoiceId(subscription.id, params.tenantId);
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

      const impact = analyzeMigrationImpact({
        legacy: legacy.normalized,
        projectedNormalized,
        projectedInvoice: projection.projectedInvoice,
        comparison,
        logContext: subLog,
      });

      logMigrationImpact({ ...subLog, score: impact.score, risk: impact.risk });

      const shadowRow = await billingShadowReportRepository.findLatestBySubscription(
        subscription.id
      );
      const shadowSummary = shadowRow
        ? {
            score: shadowRow.comparison_score,
            approved: shadowRow.approved,
            projection_hash: shadowRow.projection_hash,
            created_at: shadowRow.created_at,
          }
        : null;

      slices.push({
        subscription_id: subscription.id,
        cycle_key: cycleKey,
        projected_invoice: projection.projectedInvoice,
        legacy_invoice: legacy.normalized,
        impact,
        comparison,
        projection,
        consistency,
        shadow_summary: shadowSummary,
      });
    }

    const aggregatedImpact = aggregateImpact(slices);
    const overallScore = aggregatedImpact.score;
    const consistencyApproved = slices.every((s) => s.consistency.approved);
    const recommended = resolveSimulationRecommendation({
      overallScore,
      impact: aggregatedImpact,
      consistencyApproved,
      hasSubscriptions: subscriptions.length > 0,
    });
    const rollback_safe = isRollbackSafe(recommended);
    const rollback_preview = buildRollbackPreview({ recommendation: recommended, rollback_safe });
    const durationMs = Date.now() - started;

    const report: BillingMigrationSimulationReport = {
      tenant_id: params.tenantId,
      tenant_name: tenantName,
      correlation_id: correlationId,
      subscriptions: slices,
      impact: aggregatedImpact,
      comparison: slices[0]?.comparison ?? null,
      projection: slices[0]?.projection ?? null,
      consistency: slices[0]?.consistency ?? null,
      shadow: slices[0]?.shadow_summary ?? null,
      overall_score: overallScore,
      recommended,
      rollback_safe,
      rollback_preview,
      generated_at: new Date().toISOString(),
      diagnostics: {
        duration_ms: durationMs,
        engine_version: MIGRATION_SIMULATOR_ENGINE_VERSION,
        subscriptions_simulated: slices.length,
      },
    };

    logMigrationReport({
      ...logCtx,
      duration_ms: durationMs,
      score: overallScore,
      recommendation: recommended,
    });
    logMigrationSimulator('complete', {
      ...logCtx,
      duration_ms: durationMs,
      score: overallScore,
      recommendation: recommended,
    });

    recordSimulationRun({
      durationMs,
      score: overallScore,
      risk: aggregatedImpact.risk,
      failed: recommended === 'DO_NOT_MIGRATE' || recommended === 'BLOCKED',
    });

    return report;
  }
}
