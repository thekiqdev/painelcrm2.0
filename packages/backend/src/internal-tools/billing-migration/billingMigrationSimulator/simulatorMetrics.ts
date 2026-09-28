/**
 * Billing Engine V2 — Sprint 2.3F: métricas in-memory do Migration Simulator.
 */
import type { MigrationSimulatorHealthStats } from './types.js';

type MetricsState = {
  simulations: number;
  totalDurationMs: number;
  totalScore: number;
  highRisk: number;
  critical: number;
  lastSimulation: string | null;
  failures: number;
};

const state: MetricsState = {
  simulations: 0,
  totalDurationMs: 0,
  totalScore: 0,
  highRisk: 0,
  critical: 0,
  lastSimulation: null,
  failures: 0,
};

export function recordSimulationRun(params: {
  durationMs: number;
  score: number;
  risk: string;
  failed?: boolean;
}): void {
  state.simulations += 1;
  state.totalDurationMs += params.durationMs;
  state.totalScore += params.score;
  if (params.risk === 'HIGH') state.highRisk += 1;
  if (params.risk === 'CRITICAL') state.critical += 1;
  if (params.failed) state.failures += 1;
  state.lastSimulation = new Date().toISOString();
}

export function getMigrationSimulatorHealthStats(): MigrationSimulatorHealthStats {
  return {
    healthy: state.failures === 0,
    simulations: state.simulations,
    average_duration:
      state.simulations > 0 ? Math.round(state.totalDurationMs / state.simulations) : null,
    average_score:
      state.simulations > 0 ? Math.round(state.totalScore / state.simulations) : null,
    high_risk: state.highRisk,
    critical: state.critical,
    last_simulation: state.lastSimulation,
  };
}

export function resetSimulatorMetricsForTests(): void {
  state.simulations = 0;
  state.totalDurationMs = 0;
  state.totalScore = 0;
  state.highRisk = 0;
  state.critical = 0;
  state.lastSimulation = null;
  state.failures = 0;
}
