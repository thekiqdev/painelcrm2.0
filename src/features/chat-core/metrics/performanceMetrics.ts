/**
 * F5.12 / MB-025 — gate central da telemetria de performance.
 * Produção: ver `productionPolicy.ts` (env + sampling + flag).
 */

import { isChatPerformanceTelemetryEnabled } from './productionPolicy';
import { flushChatMetricsSample } from './productionSink';

export type PerfScenario = 'chat_open' | 'conversation_open' | 'incoming_message';

type ScenarioMark = {
  name: PerfScenario;
  startedAt: number;
  snapshotAtStart: PerfCountersSnapshot;
};

export type PerfCountersSnapshot = {
  renders: number;
  reducers: number;
  selectors: number;
  subscriptions: number;
  http: number;
  socketEvents: number;
  reducerMsTotal: number;
  selectorMsTotal: number;
  socketApplyMsTotal: number;
};

let scenario: ScenarioMark | null = null;

export { isChatPerformanceTelemetryEnabled };

export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function emptyPerfCounters(): PerfCountersSnapshot {
  return {
    renders: 0,
    reducers: 0,
    selectors: 0,
    subscriptions: 0,
    http: 0,
    socketEvents: 0,
    reducerMsTotal: 0,
    selectorMsTotal: 0,
    socketApplyMsTotal: 0,
  };
}

/** @internal — módulos filhos atualizam este agregado leve. */
export const perfCounters: PerfCountersSnapshot = emptyPerfCounters();

const lastScenarioResults = new Map<
  PerfScenario,
  { durationMs: number; delta: PerfCountersSnapshot }
>();

export function resetPerfCounters(): void {
  Object.assign(perfCounters, emptyPerfCounters());
  scenario = null;
  lastScenarioResults.clear();
}

export function beginPerfScenario(name: PerfScenario): void {
  if (!isChatPerformanceTelemetryEnabled()) return;
  scenario = {
    name,
    startedAt: nowMs(),
    snapshotAtStart: { ...perfCounters },
  };
}

export function endPerfScenario(name: PerfScenario): {
  scenario: PerfScenario;
  durationMs: number;
  delta: PerfCountersSnapshot;
} | null {
  if (!isChatPerformanceTelemetryEnabled()) return null;
  if (!scenario || scenario.name !== name) return null;
  const durationMs = Math.max(0, Math.round(nowMs() - scenario.startedAt));
  const start = scenario.snapshotAtStart;
  const delta: PerfCountersSnapshot = {
    renders: perfCounters.renders - start.renders,
    reducers: perfCounters.reducers - start.reducers,
    selectors: perfCounters.selectors - start.selectors,
    subscriptions: perfCounters.subscriptions - start.subscriptions,
    http: perfCounters.http - start.http,
    socketEvents: perfCounters.socketEvents - start.socketEvents,
    reducerMsTotal: perfCounters.reducerMsTotal - start.reducerMsTotal,
    selectorMsTotal: perfCounters.selectorMsTotal - start.selectorMsTotal,
    socketApplyMsTotal: perfCounters.socketApplyMsTotal - start.socketApplyMsTotal,
  };
  scenario = null;
  lastScenarioResults.set(name, { durationMs, delta });
  if (import.meta.env.DEV) {
    console.info(`[chat-core-perf] scenario_end:${name}`, { durationMs, delta });
  } else {
    flushChatMetricsSample({
      scenario: name,
      durationMs,
      delta,
      inbox_ms: name === 'chat_open' ? durationMs : undefined,
      messages_ms: name === 'conversation_open' ? durationMs : undefined,
      realtime_ms: name === 'incoming_message' ? durationMs : undefined,
    });
  }
  return { scenario: name, durationMs, delta };
}

export function getActivePerfScenario(): PerfScenario | null {
  return scenario?.name ?? null;
}

export function getLastScenarioResult(
  name: PerfScenario,
): { durationMs: number; delta: PerfCountersSnapshot } | undefined {
  return lastScenarioResults.get(name);
}

export function clearScenarioResults(): void {
  lastScenarioResults.clear();
}
