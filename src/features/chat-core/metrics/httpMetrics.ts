/**
 * F5.12 — classificação de requests HTTP do Chat Core.
 */

import {
  isChatPerformanceTelemetryEnabled,
  perfCounters,
} from './performanceMetrics';

export type ChatPerfHttpKind =
  | 'GET conversations'
  | 'GET messages'
  | 'GET instances'
  | 'GET attendance-counts'
  | 'POST syncConversationMessages'
  | 'other';

type HttpBucket = {
  count: number;
  samples: Array<{ at: number; endpoint: string; source: string; durationMs?: number }>;
};

const MAX_SAMPLES = 200;
const byKind = new Map<ChatPerfHttpKind, HttpBucket>();

export function classifyHttpEndpoint(endpoint: string, method: string): ChatPerfHttpKind {
  const ep = endpoint.toLowerCase();
  const m = method.toUpperCase();
  if (m === 'POST' && (ep.includes('sync') || ep.includes('/messages/sync'))) {
    return 'POST syncConversationMessages';
  }
  if (ep.includes('attendance') || ep.includes('unread')) return 'GET attendance-counts';
  if (ep.includes('instances')) return 'GET instances';
  if (ep.includes('/messages')) return 'GET messages';
  if (ep.includes('conversation')) return 'GET conversations';
  return 'other';
}

export function recordHttpMetric(sample: {
  kind?: ChatPerfHttpKind;
  endpoint: string;
  method: string;
  source: string;
  durationMs?: number;
}): void {
  if (!isChatPerformanceTelemetryEnabled()) return;
  const kind = sample.kind ?? classifyHttpEndpoint(sample.endpoint, sample.method);
  perfCounters.http += 1;
  const bucket = byKind.get(kind) ?? { count: 0, samples: [] };
  bucket.count += 1;
  bucket.samples.push({
    at: Date.now(),
    endpoint: sample.endpoint,
    source: sample.source,
    durationMs: sample.durationMs,
  });
  if (bucket.samples.length > MAX_SAMPLES) {
    bucket.samples.splice(0, bucket.samples.length - MAX_SAMPLES);
  }
  byKind.set(kind, bucket);
}

/** Bridge a partir de `recordChatHttpRequest` (baseline F0). */
export function recordHttpFromBaselineSample(sample: {
  endpoint: string;
  method: string;
  source: string;
  durationMs?: number;
}): void {
  recordHttpMetric(sample);
}

export function getHttpMetricsSnapshot(): Readonly<{
  total: number;
  byKind: Record<string, number>;
}> {
  const by: Record<string, number> = {};
  for (const [k, v] of byKind.entries()) by[k] = v.count;
  return { total: perfCounters.http, byKind: by };
}

export function resetHttpMetrics(): void {
  byKind.clear();
}
