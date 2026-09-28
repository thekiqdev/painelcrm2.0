/**
 * Billing Engine V2 — Sprint 2.4A: métricas in-memory da Certification Suite.
 */
import type { CertificationHealthStats } from './types.js';

type State = {
  totalRuns: number;
  certified: number;
  failed: number;
  scoreSum: number;
  lastEvaluation: string | null;
  lastEngineCertified: boolean;
  lastTotalSubscriptions: number;
};

const state: State = {
  totalRuns: 0,
  certified: 0,
  failed: 0,
  scoreSum: 0,
  lastEvaluation: null,
  lastEngineCertified: false,
  lastTotalSubscriptions: 0,
};

export function recordCertificationRun(params: {
  certified: boolean;
  score: number;
  engineCertified?: boolean;
  totalSubscriptions?: number;
}): void {
  state.totalRuns += 1;
  if (params.certified) state.certified += 1;
  else state.failed += 1;
  state.scoreSum += params.score;
  state.lastEvaluation = new Date().toISOString();
  if (params.engineCertified != null) state.lastEngineCertified = params.engineCertified;
  if (params.totalSubscriptions != null) state.lastTotalSubscriptions = params.totalSubscriptions;
}

export function getCertificationHealthStats(): CertificationHealthStats {
  const total = state.totalRuns;
  return {
    healthy: state.lastEngineCertified,
    total_subscriptions: state.lastTotalSubscriptions || total,
    certified: state.certified,
    failed: state.failed,
    average_score: total > 0 ? Math.round((state.scoreSum / total) * 100) / 100 : null,
    engine_certified: state.lastEngineCertified,
    last_evaluation: state.lastEvaluation,
  };
}

export function resetCertificationMetricsForTests(): void {
  state.totalRuns = 0;
  state.certified = 0;
  state.failed = 0;
  state.scoreSum = 0;
  state.lastEvaluation = null;
  state.lastEngineCertified = false;
  state.lastTotalSubscriptions = 0;
}
