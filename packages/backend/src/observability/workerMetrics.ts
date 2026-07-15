import { getObservabilityConfig, shouldSampleObservation } from './config.js';
import { ensureCounter, ensureGauge, ensureHistogram, incCounter, observeHistogram, setGauge } from './registry.js';

let defs = false;

export function registerWorkerMetricDefs(): void {
  if (defs) return;
  defs = true;
  ensureCounter('worker_runs_total', 'Worker tick executions');
  ensureCounter('worker_failures_total', 'Worker tick failures');
  ensureHistogram('worker_duration_ms', 'Worker tick duration');
  ensureGauge('worker_queue_backlog', 'Reported worker queue backlog');
  ensureGauge('worker_last_success_unixtime', 'Last successful worker tick (unix s)');
}

export function recordWorkerRun(worker: string, durationMs: number, ok: boolean): void {
  const cfg = getObservabilityConfig();
  if (!cfg.enabled || !shouldSampleObservation(cfg.sampleRate)) return;
  registerWorkerMetricDefs();
  incCounter('worker_runs_total', { worker, status: ok ? 'ok' : 'error' });
  observeHistogram('worker_duration_ms', durationMs, { worker });
  if (!ok) incCounter('worker_failures_total', { worker });
  else setGauge('worker_last_success_unixtime', Math.floor(Date.now() / 1000), { worker });
}

export function recordWorkerBacklog(worker: string, backlog: number): void {
  const cfg = getObservabilityConfig();
  if (!cfg.enabled) return;
  registerWorkerMetricDefs();
  setGauge('worker_queue_backlog', Math.max(0, backlog), { worker });
}
