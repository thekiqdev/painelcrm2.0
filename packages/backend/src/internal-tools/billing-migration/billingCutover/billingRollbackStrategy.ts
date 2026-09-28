/**
 * Billing Engine V2 — Sprint 2.3G: estratégia de rollback (documentação apenas).
 */
import type { BillingMigrationSimulationReport } from '../billingMigrationSimulator/types.js';
import type {
  BillingCutoverDecision,
  BillingRollbackStrategy,
  CutoverPolicyResult,
  FeatureFlagRecommendation,
} from './types.js';

export function buildRollbackStrategy(params: {
  simulator: BillingMigrationSimulationReport;
  policy: CutoverPolicyResult;
}): BillingRollbackStrategy {
  const preview = params.simulator.rollback_preview;
  const hasBlockers = params.policy.blockingIssues.some(
    (i) => i.severity === 'CRITICAL' || i.severity === 'ERROR'
  );

  return {
    rollback_safe: params.simulator.rollback_safe && !hasBlockers,
    rollback_required: false,
    rollback_reason: hasBlockers ? 'Bloqueios detectados — cutover não executado' : null,
    rollback_steps: preview.rollback_steps,
    estimated_duration: params.simulator.rollback_safe ? '< 5 minutos (feature flag)' : 'Revisão manual necessária',
  };
}

export function resolveFeatureFlagRecommendation(params: {
  approved: boolean;
  approvalLevel: BillingCutoverDecision['approvalLevel'];
  policy: CutoverPolicyResult;
}): FeatureFlagRecommendation {
  if (params.policy.blockingIssues.some((i) => i.severity === 'CRITICAL')) {
    return 'KEEP_V1';
  }

  if (params.approved && params.approvalLevel === 'CUTOVER_PENDING') {
    return 'ENABLE_V2';
  }

  if (params.approved || params.approvalLevel === 'APPROVED') {
    return 'ENABLE_DUAL_WRITE';
  }

  if (params.approvalLevel === 'READY_WITH_WARNINGS' || params.approvalLevel === 'READY') {
    return 'ENABLE_SHADOW';
  }

  return 'KEEP_V1';
}

export function resolveRecommendedAction(params: {
  approved: boolean;
  approvalLevel: BillingCutoverDecision['approvalLevel'];
  flagRecommendation: FeatureFlagRecommendation;
}): BillingCutoverDecision['recommendedAction'] {
  if (params.flagRecommendation === 'ROLLBACK_TO_V1') return 'ROLLBACK';
  if (params.approved && params.approvalLevel === 'CUTOVER_PENDING') {
    return 'EXECUTE_CUTOVER_SPRINT_2_4';
  }
  if (params.approved) return 'PREPARE_CUTOVER';
  if (params.approvalLevel === 'READY_WITH_WARNINGS') return 'REVIEW';
  if (params.approvalLevel === 'BLOCKED') return 'FIX_BLOCKERS';
  return 'WAIT';
}

export function resolveCutoverTimeline(
  approvalLevel: BillingCutoverDecision['approvalLevel']
): BillingCutoverDecision['timeline'] {
  if (approvalLevel === 'CUTOVER_PENDING') return 'CUTOVER_PENDING';
  if (approvalLevel === 'APPROVED') return 'APPROVED';
  if (approvalLevel === 'READY' || approvalLevel === 'READY_WITH_WARNINGS') return 'READY';
  if (approvalLevel === 'BLOCKED') return 'NOT_READY';
  return 'NOT_READY';
}

export function buildCutoverReason(params: {
  approved: boolean;
  approvalLevel: BillingCutoverDecision['approvalLevel'];
  blockingCount: number;
}): string {
  if (params.approved) {
    return `Cutover aprovado — nível ${params.approvalLevel}`;
  }
  if (params.blockingCount > 0) {
    return `Cutover bloqueado — ${params.blockingCount} bloqueio(s)`;
  }
  return `Cutover não aprovado — nível ${params.approvalLevel}`;
}
