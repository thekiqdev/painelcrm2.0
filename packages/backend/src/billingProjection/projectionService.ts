/**
 * Billing Engine V2 — Sprint 2.3D: serviço de projeção para APIs e Shadow.
 */
import { billingExecutionContextBuilder } from '../billingExecutionContext/billingExecutionContextBuilder.js';
import { getSubscriptionById } from '../services/billingSubscriptionService.js';
import { normalizeLegacyRenewal } from '../internal-tools/billing-migration/billingShadow/legacyRenewalNormalizer.js';
import { renewalComparisonService } from '../internal-tools/billing-migration/billingShadow/renewalComparisonService.js';
import { billingShadowReportRepository } from '../internal-tools/billing-migration/billingShadow/billingShadowReportRepository.js';
import type { BillingShadowReport } from '../internal-tools/billing-migration/billingShadow/types.js';
import { BillingProjectionEngine } from './billingProjectionEngine.js';
import { normalizeProjectionResult } from './projectionNormalizer.js';
import { logProjectionCompare } from './projectionLogger.js';
import { getProjectionDashboardStats, getProjectionHealthStats } from './projectionMetrics.js';
import type { BillingProjectionDashboard, BillingProjectionHealthStats, ProjectionResult } from './types.js';
import { PROJECTION_ENGINE_VERSION } from './types.js';
import { serializeProjectedInvoice } from './serializeProjection.js';

export type GetProjectionInput = {
  subscriptionId: string;
  tenantId: string;
  cycleKey: string;
  periodStartYmd?: string;
  periodEndYmd?: string | null;
  correlationId?: string;
  skipCache?: boolean;
};

export async function projectBillingForSubscription(
  input: GetProjectionInput
): Promise<{ context_build_ms: number; projection: ProjectionResult; serialized: ReturnType<typeof serializeProjectedInvoice> }> {
  const buildStarted = Date.now();
  const executionContext = await billingExecutionContextBuilder.build({
    subscriptionId: input.subscriptionId,
    tenantId: input.tenantId,
    cycleKey: input.cycleKey,
    periodStartYmd: input.periodStartYmd ?? input.cycleKey,
    periodEndYmd: input.periodEndYmd,
    correlationId: input.correlationId,
    skipCache: input.skipCache,
  });
  const contextBuildMs = Date.now() - buildStarted;
  const projection = BillingProjectionEngine.project({
    context: executionContext,
    skipCache: input.skipCache,
  });
  return {
    context_build_ms: contextBuildMs,
    projection,
    serialized: serializeProjectedInvoice(projection.projectedInvoice),
  };
}

export type CompareProjectionInput = GetProjectionInput & {
  renewalResult?: Parameters<typeof normalizeLegacyRenewal>[0]['renewalResult'];
  persistReport?: boolean;
};

export async function compareProjectionWithLegacy(
  input: CompareProjectionInput
): Promise<{
  projection: ProjectionResult;
  comparison: ReturnType<typeof renewalComparisonService.compareWithProjection>;
  report?: BillingShadowReport;
}> {
  const subscription = await getSubscriptionById(input.subscriptionId);
  if (!subscription) {
    throw new Error('SUBSCRIPTION_NOT_FOUND');
  }

  const { projection } = await projectBillingForSubscription(input);
  const projectedNormalized = normalizeProjectionResult(projection);

  let legacyNormalized;
  if (input.renewalResult) {
    const legacy = await normalizeLegacyRenewal({
      subscription,
      cycleKey: input.cycleKey,
      periodStartYmd: input.periodStartYmd ?? input.cycleKey,
      renewalResult: input.renewalResult,
    });
    legacyNormalized = legacy.normalized;
  } else {
    legacyNormalized = {
      ...projectedNormalized,
      metadata: { source: 'legacy_v1_empty', no_invoice: true },
      sideEffects: {
        invoice: false,
        notification: false,
        timeline: false,
        history: false,
        gateway: false,
      },
    };
  }

  const comparison = renewalComparisonService.compareWithProjection(
    legacyNormalized,
    projection
  );

  logProjectionCompare('complete', {
    correlation_id: input.correlationId,
    subscription_id: input.subscriptionId,
    cycle_key: input.cycleKey,
    duration_ms: comparison.comparison_time_ms,
  }, {
    score: comparison.score,
    approved: comparison.approved,
    projection_hash: projection.diagnostics.hash,
  });

  let report: BillingShadowReport | undefined;
  if (input.persistReport) {
    report = {
      subscription_id: input.subscriptionId,
      tenant_id: input.tenantId,
      cycle: input.cycleKey,
      correlation_id: input.correlationId ?? null,
      comparison,
      summary: comparison.approved
        ? `Projection approved — score ${comparison.score}`
        : `Projection diverged — score ${comparison.score}`,
      differences: comparison.differences,
      score: comparison.score,
      approved: comparison.approved,
      duration_ms: projection.duration,
      engine_versions: {
        legacy: 'v1_foundation_1b',
        shadow: PROJECTION_ENGINE_VERSION,
      },
      projection_duration_ms: projection.duration,
      projection_score: comparison.score,
      projection_version: projection.diagnostics.builderVersion,
      projection_engine_version: PROJECTION_ENGINE_VERSION,
      projection_hash: projection.diagnostics.hash,
      projection_success: projection.approved,
    };
    await billingShadowReportRepository.insert(report);
  }

  return { projection, comparison, report };
}

export function getBillingProjectionHealthStats(): BillingProjectionHealthStats {
  return getProjectionHealthStats();
}

export function getBillingProjectionDashboard(): BillingProjectionDashboard {
  return getProjectionDashboardStats();
}
