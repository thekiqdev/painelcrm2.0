/**
 * F4b — métricas de listagem de conversas (agregada vs legado).
 * Logs somente com flag CHAT_CORE_METRICS no painel Super Admin.
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

import type { ChatAggregatedSurface } from './chatAggregatedFlags';

export type ChatConversationsFetchMetricSample = {
  at: number;
  surface: ChatAggregatedSurface;
  source: 'aggregated' | 'legacy';
  fallback: boolean;
  durationMs: number;
  payloadBytes: number;
  itemCount: number;
  httpCalls: number;
  error?: string;
};

type MetricsState = {
  aggregated: number;
  legacy: number;
  fallbacks: number;
  errors: number;
  durationSumMs: number;
  durationCount: number;
  payloadBytesSum: number;
  samples: ChatConversationsFetchMetricSample[];
};

const state: MetricsState = {
  aggregated: 0,
  legacy: 0,
  fallbacks: 0,
  errors: 0,
  durationSumMs: 0,
  durationCount: 0,
  payloadBytesSum: 0,
  samples: [],
};

const MAX_SAMPLES = 200;

function metricsLogEnabled(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
}

function log(event: string, payload: Record<string, unknown>): void {
  if (!metricsLogEnabled()) return;
  console.info(`[chat-conversations-metrics] ${event}`, payload);
}

export function recordChatConversationsFetch(sample: Omit<ChatConversationsFetchMetricSample, 'at'>): void {
  const row: ChatConversationsFetchMetricSample = { at: Date.now(), ...sample };
  if (sample.source === 'aggregated') state.aggregated += 1;
  else state.legacy += 1;
  if (sample.fallback) state.fallbacks += 1;
  if (sample.error) state.errors += 1;
  state.durationSumMs += sample.durationMs;
  state.durationCount += 1;
  state.payloadBytesSum += sample.payloadBytes;
  state.samples.push(row);
  if (state.samples.length > MAX_SAMPLES) {
    state.samples.splice(0, state.samples.length - MAX_SAMPLES);
  }
  log('fetch', row as unknown as Record<string, unknown>);
}

export type ChatConversationsMetricsSnapshot = {
  collectedAt: string;
  aggregatedCalls: number;
  legacyCalls: number;
  fallbacks: number;
  errors: number;
  avgDurationMs: number;
  avgPayloadBytes: number;
  aggregatedSharePercent: number;
  recentSamples: ChatConversationsFetchMetricSample[];
};

export function getChatConversationsMetricsSnapshot(limit = 20): ChatConversationsMetricsSnapshot {
  const total = state.aggregated + state.legacy;
  return {
    collectedAt: new Date().toISOString(),
    aggregatedCalls: state.aggregated,
    legacyCalls: state.legacy,
    fallbacks: state.fallbacks,
    errors: state.errors,
    avgDurationMs:
      state.durationCount > 0 ? Math.round(state.durationSumMs / state.durationCount) : 0,
    avgPayloadBytes:
      state.durationCount > 0 ? Math.round(state.payloadBytesSum / state.durationCount) : 0,
    aggregatedSharePercent:
      total > 0 ? Math.round((state.aggregated / total) * 10000) / 100 : 0,
    recentSamples: state.samples.slice(-limit),
  };
}

export function resetChatConversationsMetrics(): void {
  state.aggregated = 0;
  state.legacy = 0;
  state.fallbacks = 0;
  state.errors = 0;
  state.durationSumMs = 0;
  state.durationCount = 0;
  state.payloadBytesSum = 0;
  state.samples.length = 0;
}
