/**
 * F5.12 — relatório consolidado de performance (snapshot + baseline template).
 */

import { getRenderMetricsSnapshot, resetRenderMetrics } from './renderMetrics';
import { getReducerMetricsSnapshot, resetReducerMetrics } from './reducerMetrics';
import { getSelectorMetricsSnapshot, resetSelectorMetrics } from './selectorMetrics';
import {
  getSubscriptionMetricsSnapshot,
  resetSubscriptionMetrics,
} from './subscriptionMetrics';
import { getHttpMetricsSnapshot, resetHttpMetrics } from './httpMetrics';
import { getSocketMetricsSnapshot, resetSocketMetrics } from './socketMetrics';
import { getMemoryMetricsSnapshot, resetMemoryMetrics } from './memoryMetrics';
import {
  emptyPerfCounters,
  getActivePerfScenario,
  getLastScenarioResult,
  isChatPerformanceTelemetryEnabled,
  perfCounters,
  resetPerfCounters,
  type PerfCountersSnapshot,
  type PerfScenario,
} from './performanceMetrics';

export type ChatPerformanceReport = {
  collectedAt: string;
  telemetryEnabled: boolean;
  activeScenario: PerfScenario | null;
  counters: PerfCountersSnapshot;
  renders: ReturnType<typeof getRenderMetricsSnapshot>;
  reducers: ReturnType<typeof getReducerMetricsSnapshot>;
  selectors: ReturnType<typeof getSelectorMetricsSnapshot>;
  subscriptions: ReturnType<typeof getSubscriptionMetricsSnapshot>;
  http: ReturnType<typeof getHttpMetricsSnapshot>;
  socket: ReturnType<typeof getSocketMetricsSnapshot>;
  memory: ReturnType<typeof getMemoryMetricsSnapshot>;
  /** Placeholders para preencher com corridas manuais / DevTools. */
  baselineTemplate: {
    chat_open: Record<string, string | number>;
    conversation_open: Record<string, string | number>;
    incoming_message: Record<string, string | number>;
    memory: Record<string, string | number>;
  };
};

export function getChatPerformanceReport(): ChatPerformanceReport {
  const memory = getMemoryMetricsSnapshot();
  const chatOpen = getLastScenarioResult('chat_open');
  const convOpen = getLastScenarioResult('conversation_open');
  const incoming = getLastScenarioResult('incoming_message');

  return {
    collectedAt: new Date().toISOString(),
    telemetryEnabled: isChatPerformanceTelemetryEnabled(),
    activeScenario: getActivePerfScenario(),
    counters: { ...perfCounters },
    renders: getRenderMetricsSnapshot(),
    reducers: getReducerMetricsSnapshot(),
    selectors: getSelectorMetricsSnapshot(),
    subscriptions: getSubscriptionMetricsSnapshot(),
    http: getHttpMetricsSnapshot(),
    socket: getSocketMetricsSnapshot(),
    memory,
    baselineTemplate: {
      chat_open: {
        http_requests: chatOpen?.delta.http ?? '?',
        reducers: chatOpen?.delta.reducers ?? '?',
        selectors: chatOpen?.delta.selectors ?? '?',
        subscriptions: chatOpen?.delta.subscriptions ?? '?',
        renders: chatOpen?.delta.renders ?? '?',
        mount_ms: chatOpen?.durationMs ?? '?',
      },
      conversation_open: {
        http_requests: convOpen?.delta.http ?? '?',
        reducers: convOpen?.delta.reducers ?? '?',
        selectors: convOpen?.delta.selectors ?? '?',
        renders: convOpen?.delta.renders ?? '?',
        load_ms: convOpen?.durationMs ?? '?',
      },
      incoming_message: {
        reducers: incoming?.delta.reducers ?? '?',
        selectors: incoming?.delta.selectors ?? '?',
        renders: incoming?.delta.renders ?? '?',
        socket_latency_ms: incoming?.durationMs ?? '?',
      },
      memory: {
        '100_conversations': memory.projections['100_conversations'] ?? '?',
        '500_conversations': memory.projections['500_conversations'] ?? '?',
        '1000_conversations': memory.projections['1000_conversations'] ?? '?',
        '5000_messages': memory.projections['5000_messages'] ?? '?',
        '10000_messages': memory.projections['10000_messages'] ?? '?',
        latest_estimated_bytes: memory.latest?.estimatedBytes ?? '?',
      },
    },
  };
}

/** Imprime relatório no console (DEV). */
export function logChatPerformanceReport(): ChatPerformanceReport {
  const report = getChatPerformanceReport();
  if (isChatPerformanceTelemetryEnabled() && import.meta.env.DEV) {
    console.info('[chat-core-perf] report', report);
  }
  return report;
}

export function resetChatPerformanceMetrics(): void {
  resetRenderMetrics();
  resetReducerMetrics();
  resetSelectorMetrics();
  resetSubscriptionMetrics();
  resetHttpMetrics();
  resetSocketMetrics();
  resetMemoryMetrics();
  resetPerfCounters();
  Object.assign(perfCounters, emptyPerfCounters());
}
