/**
 * Billing Engine V2 — Sprint 2.3E: métricas in-memory do Migration Readiness.
 */
import type { MigrationReadinessHealthStats } from './types.js';

type MetricsState = {
  evaluations: number;
  readyTenants: number;
  notReadyTenants: number;
  totalScore: number;
  criticalTenants: number;
  migrationCandidates: number;
  lastEvaluation: string | null;
};

const state: MetricsState = {
  evaluations: 0,
  readyTenants: 0,
  notReadyTenants: 0,
  totalScore: 0,
  criticalTenants: 0,
  migrationCandidates: 0,
  lastEvaluation: null,
};

export function recordMigrationEvaluation(params: {
  approved: boolean;
  overallScore: number;
  criticalCount: number;
  readyForMigration: boolean;
}): void {
  state.evaluations += 1;
  state.totalScore += params.overallScore;
  if (params.approved) state.readyTenants += 1;
  else state.notReadyTenants += 1;
  if (params.criticalCount > 0) state.criticalTenants += 1;
  if (params.readyForMigration) state.migrationCandidates += 1;
  state.lastEvaluation = new Date().toISOString();
}

export function getMigrationReadinessHealthStats(): MigrationReadinessHealthStats {
  return {
    ready_tenants: state.readyTenants,
    not_ready_tenants: state.notReadyTenants,
    average_score:
      state.evaluations > 0 ? Math.round(state.totalScore / state.evaluations) : null,
    critical_tenants: state.criticalTenants,
    last_evaluation: state.lastEvaluation,
    migration_candidates: state.migrationCandidates,
  };
}

export function resetMigrationMetricsForTests(): void {
  state.evaluations = 0;
  state.readyTenants = 0;
  state.notReadyTenants = 0;
  state.totalScore = 0;
  state.criticalTenants = 0;
  state.migrationCandidates = 0;
  state.lastEvaluation = null;
}
