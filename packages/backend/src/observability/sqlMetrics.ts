import { getObservabilityConfig, shouldSampleObservation } from './config.js';
import { ensureCounter, ensureHistogram, incCounter, observeHistogram } from './registry.js';

let defs = false;

export function registerSqlMetricDefs(): void {
  if (defs) return;
  defs = true;
  ensureCounter('sql_queries_total', 'SQL queries executed');
  ensureCounter('sql_slow_queries_total', 'SQL queries above OBS_SQL_SLOW_MS');
  ensureHistogram('sql_query_duration_ms', 'SQL query latency');
}

/** Chamado do facade `pool.query` — sem alterar texto SQL. */
export function recordSqlQuery(durationMs: number, ok: boolean): void {
  const cfg = getObservabilityConfig();
  if (!cfg.enabled || !shouldSampleObservation(cfg.sampleRate)) return;
  registerSqlMetricDefs();
  const status = ok ? 'ok' : 'error';
  incCounter('sql_queries_total', { status });
  observeHistogram('sql_query_duration_ms', durationMs, { status });
  if (durationMs >= cfg.sqlSlowMs) {
    incCounter('sql_slow_queries_total', { status });
  }
}
