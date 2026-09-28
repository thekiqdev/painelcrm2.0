/**
 * Billing Engine V2 — Sprint 2.4B: métricas do laboratório.
 */
type State = {
  runs: number;
  approved: number;
  failed: number;
  totalScenarios: number;
  lastRun: string | null;
  lastApproved: boolean;
};

const state: State = {
  runs: 0,
  approved: 0,
  failed: 0,
  totalScenarios: 0,
  lastRun: null,
  lastApproved: false,
};

export function recordLabRun(params: {
  approved: boolean;
  totalScenarios: number;
  passed: number;
  failed: number;
}): void {
  state.runs += 1;
  state.totalScenarios = params.totalScenarios;
  state.lastApproved = params.approved;
  state.lastRun = new Date().toISOString();
  if (params.approved) state.approved += 1;
  else state.failed += 1;
}

export function getLabMetrics() {
  return { ...state };
}

export function resetLabMetricsForTests(): void {
  state.runs = 0;
  state.approved = 0;
  state.failed = 0;
  state.totalScenarios = 0;
  state.lastRun = null;
  state.lastApproved = false;
}
