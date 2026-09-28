/**
 * MB-025 — política de métricas Chat em produção.
 *
 * - DEV/test: exige flag catalog `CHAT_CORE_METRICS` (comportamento histórico).
 * - Produção: ativa com `VITE_CHAT_METRICS_PROD=1` **ou** flag ON no painel,
 *   sempre sujeita a sampling `VITE_CHAT_METRICS_SAMPLE_RATE` (default 0.05).
 * - Overhead: decisão sticky por sessão de página; sem logs ruidosos em prod.
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

const SESSION_KEY = '__chat_metrics_sample_v1';

function readSampleRate(): number {
  const raw = Number(import.meta.env.VITE_CHAT_METRICS_SAMPLE_RATE ?? '0.05');
  if (!Number.isFinite(raw)) return 0.05;
  return Math.min(1, Math.max(0, raw));
}

function prodEnvEnabled(): boolean {
  return String(import.meta.env.VITE_CHAT_METRICS_PROD || '') === '1';
}

/** Sticky sample decision for this JS realm (tab). */
function sessionAllowsSample(rate: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  try {
    const g = globalThis as unknown as Record<string, unknown>;
    const existing = g[SESSION_KEY];
    if (typeof existing === 'boolean') return existing;
    const allow = Math.random() < rate;
    g[SESSION_KEY] = allow;
    return allow;
  } catch {
    return Math.random() < rate;
  }
}

/**
 * Gate único para telemetria Chat (DEV + prod amostrado).
 * Compatível ADR-010 / FEATURE_FLAGS — default OFF sem env/flag.
 */
export function isChatPerformanceTelemetryEnabled(): boolean {
  const flagOn = isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
  const testLike = import.meta.env.MODE === 'test';
  const devLike = import.meta.env.DEV === true;

  if (testLike || devLike) {
    return flagOn;
  }

  // production / preview
  if (!prodEnvEnabled() && !flagOn) return false;
  return sessionAllowsSample(readSampleRate());
}

export function getChatMetricsProductionConfig(): {
  prodEnv: boolean;
  sampleRate: number;
  flagOn: boolean;
  enabled: boolean;
} {
  return {
    prodEnv: prodEnvEnabled(),
    sampleRate: readSampleRate(),
    flagOn: isChatMigrationFlagEnabled('CHAT_CORE_METRICS'),
    enabled: isChatPerformanceTelemetryEnabled(),
  };
}

/** Endpoint beacon (relativo) — só POST quando amostrado. */
export function getChatMetricsBeaconPath(): string {
  return '/metrics/platform/chat-client';
}
