/**
 * Billing Engine V2 — Sprint 2.3G: montagem da decisão de cutover.
 */
import type { BillingMigrationReadinessReport } from '../billingMigrationReadiness/types.js';
import type { BillingMigrationSimulationReport } from '../billingMigrationSimulator/types.js';
import {
  buildCutoverReason,
  buildRollbackStrategy,
  resolveCutoverTimeline,
  resolveFeatureFlagRecommendation,
  resolveRecommendedAction,
} from './billingRollbackStrategy.js';
import { evaluateCutoverPolicy } from './billingCutoverPolicy.js';
import { logCutoverBlocker, logCutoverDecision, logCutoverRecommendation } from './cutoverLogger.js';
import type { BillingCutoverDecision, CutoverPolicyInput } from './types.js';

export function buildCutoverDecision(params: {
  tenantId: string;
  correlationId: string;
  readiness: BillingMigrationReadinessReport;
  simulator: BillingMigrationSimulationReport;
  shadowScore?: number | null;
  projectionScore?: number | null;
  consistencyApproved?: boolean;
}): BillingCutoverDecision {
  const policyInput: CutoverPolicyInput = {
    readiness: params.readiness,
    simulator: params.simulator,
    shadowScore: params.shadowScore ?? null,
    projectionScore: params.projectionScore ?? null,
    consistencyApproved: params.consistencyApproved,
  };

  const policy = evaluateCutoverPolicy(policyInput, {
    tenant_id: params.tenantId,
    correlation_id: params.correlationId,
  });

  const rollbackPlan = buildRollbackStrategy({ simulator: params.simulator, policy });
  const featureFlagRecommendation = resolveFeatureFlagRecommendation({
    approved: policy.approved,
    approvalLevel: policy.approvalLevel,
    policy,
  });
  const recommendedAction = resolveRecommendedAction({
    approved: policy.approved,
    approvalLevel: policy.approvalLevel,
    flagRecommendation: featureFlagRecommendation,
  });
  const timeline = resolveCutoverTimeline(policy.approvalLevel);

  const nextEvaluation = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  for (const blocker of policy.blockingIssues.filter((i) => i.severity === 'CRITICAL')) {
    logCutoverBlocker({
      tenant_id: params.tenantId,
      correlation_id: params.correlationId,
      code: blocker.code,
    });
  }

  const decision: BillingCutoverDecision = {
    approved: policy.approved,
    approvalLevel: policy.approvalLevel,
    reason: buildCutoverReason({
      approved: policy.approved,
      approvalLevel: policy.approvalLevel,
      blockingCount: policy.blockingIssues.length,
    }),
    blockingIssues: policy.blockingIssues,
    warnings: policy.warnings,
    recommendedAction,
    rollbackPlan,
    nextEvaluation,
    featureFlagRecommendation,
    timeline,
    overallScore: policy.overallScore,
  };

  logCutoverDecision({
    tenant_id: params.tenantId,
    correlation_id: params.correlationId,
    approval_level: decision.approvalLevel,
    recommendation: decision.featureFlagRecommendation,
    approved: decision.approved,
  });

  logCutoverRecommendation({
    tenant_id: params.tenantId,
    correlation_id: params.correlationId,
    recommendation: decision.featureFlagRecommendation,
    approval_level: decision.approvalLevel,
  });

  return decision;
}
