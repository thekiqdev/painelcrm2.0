/**
 * MB-025 — sink de baixo overhead para amostras em produção (sendBeacon / fetch keepalive).
 */

import { getChatMetricsBeaconPath, isChatPerformanceTelemetryEnabled } from './productionPolicy';
import type { PerfCountersSnapshot } from './performanceMetrics';

let lastFlushAt = 0;
const MIN_FLUSH_GAP_MS = 15_000;

export function flushChatMetricsSample(payload: {
  durationMs?: number;
  scenario?: string;
  delta?: PerfCountersSnapshot;
  inbox_ms?: number;
  messages_ms?: number;
  realtime_ms?: number;
  unread?: number;
  store_sync?: number;
  bridge_sync?: number;
}): void {
  if (!isChatPerformanceTelemetryEnabled()) return;
  if (import.meta.env.DEV) return; // DEV continua no console via report.ts
  const now = Date.now();
  if (now - lastFlushAt < MIN_FLUSH_GAP_MS) return;
  lastFlushAt = now;

  const body = JSON.stringify({
    inbox_ms: payload.inbox_ms ?? payload.durationMs,
    messages_ms: payload.messages_ms,
    realtime_ms: payload.realtime_ms,
    unread: payload.unread ?? payload.delta?.socketEvents,
    store_sync: payload.store_sync ?? payload.delta?.reducers,
    bridge_sync: payload.bridge_sync,
    scenario: payload.scenario,
  });

  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const url = `${base}${getChatMetricsBeaconPath()}`;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
  } catch {
    /* fall through */
  }
  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    });
  } catch {
    /* swallow — never break UX */
  }
}
