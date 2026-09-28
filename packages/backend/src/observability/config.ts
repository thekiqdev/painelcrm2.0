/**
 * MB-024 — configuração de observabilidade de plataforma.
 *
 * Env:
 *   OBS_METRICS=1                 → ativa coleta + endpoint /metrics/platform
 *   OBS_METRICS_TOKEN=<secret>    → exige Bearer/token query no scrape (recomendado prod)
 *   OBS_METRICS_SAMPLE_RATE=1     → 0..1 (default 1 quando ativo)
 *   OBS_SQL_SLOW_MS=200           → limiar slow query
 *   OBS_RUNTIME_POLL_MS=15000     → poll CPU/mem/event-loop
 *   OBS_REDIS_METRICS_PREP=1      → expõe contadores Redis placeholder (Phase 8)
 */

function boolEnv(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

export type ObservabilityConfig = {
  enabled: boolean;
  metricsToken: string | null;
  sampleRate: number;
  sqlSlowMs: number;
  runtimePollMs: number;
  redisPrep: boolean;
};

export function getObservabilityConfig(): ObservabilityConfig {
  const enabled = boolEnv('OBS_METRICS');
  const rate = Math.min(1, Math.max(0, numEnv('OBS_METRICS_SAMPLE_RATE', enabled ? 1 : 0)));
  const token = String(process.env.OBS_METRICS_TOKEN || '').trim() || null;
  return {
    enabled,
    metricsToken: token,
    sampleRate: rate,
    sqlSlowMs: Math.max(1, numEnv('OBS_SQL_SLOW_MS', 200)),
    runtimePollMs: Math.max(1000, numEnv('OBS_RUNTIME_POLL_MS', 15_000)),
    redisPrep: boolEnv('OBS_REDIS_METRICS_PREP'),
  };
}

/** Decisão de sampling por operação (baixo overhead). */
export function shouldSampleObservation(sampleRate = getObservabilityConfig().sampleRate): boolean {
  if (sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return Math.random() < sampleRate;
}
