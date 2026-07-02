/**
 * Billing Engine V2 — Sprint 2.3G: métricas in-memory do Cutover Orchestrator.
 */
import type { CutoverHealthStats } from './types.js';

type MetricsState = {
  evaluations: number;
  readyTenants: number;
  blockedTenants: number;
  totalScore: number;
  rollbackSafe: number;
  cutoverCandidates: number;
  lastEvaluation: string | null;
  failures: number;
};

const state: MetricsState = {
  evaluations: 0,
  readyTenants: 0,
  blockedTenants: 0,
  totalScore: 0,
  rollbackSafe: 0,
  cutoverCandidates: 0,
  lastEvaluation: null,
  failures: 0,
};

export function recordCutoverEvaluation(params: {
  approved: boolean;
  overallScore: number;
  rollbackSafe: boolean;
  isCandidate: boolean;
  failed?: boolean;
}): void {
  state.evaluations += 1;
  state.totalScore += params.overallScore;
  if (params.approved) state.readyTenants += 1;
  else state.blockedTenants += 1;
  if (params.rollbackSafe) state.rollbackSafe += 1;
  if (params.isCandidate) state.cutoverCandidates += 1;
  if (params.failed) state.failures += 1;
  state.lastEvaluation = new Date().toISOString();
}

export function getCutoverHealthStats(): CutoverHealthStats {
  return {
    healthy: state.failures === 0,
    ready_tenants: state.readyTenants,
    blocked_tenants: state.blockedTenants,
    average_approval:
      state.evaluations > 0 ? Math.round(state.totalScore / state.evaluations) : null,
    last_evaluation: state.lastEvaluation,
    rollback_safe: state.rollbackSafe,
    cutover_candidates: state.cutoverCandidates,
  };
}

export function resetCutoverMetricsForTests(): void {
  state.evaluations = 0;
  state.readyTenants = 0;
  state.blockedTenants = 0;
  state.totalScore = 0;
  state.rollbackSafe = 0;
  state.cutoverCandidates = 0;
  state.lastEvaluation = null;
  state.failures = 0;
}
