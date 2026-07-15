/**
 * Baseline e observabilidade do Chat Core (F0).
 *
 * Coletores em memória + console (quando habilitado). Não alteram
 * fluxos da UI. Servem como infraestrutura para comparar fases F1+.
 *
 * Ativar logs: flag CHAT_CORE_METRICS no painel Super Admin.
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';
import { getChatPhaseFlagsSnapshot } from '../feature-flags';
import { recordHttpFromBaselineSample } from './httpMetrics';

export type ChatHttpMetricSample = {
  at: number;
  endpoint: string;
  method: string;
  source: string;
  conversationId?: string;
  durationMs?: number;
};

export type ChatSocketMetricSample = {
  at: number;
  action: 'open' | 'close' | 'observed';
  socketId?: string | null;
  source: string;
};

export type ChatTimingMetricSample = {
  at: number;
  kind:
    | 'chat_open'
    | 'messages_load'
    | 'realtime_update'
    | 'mark';
  label: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
};

export type ChatRealtimeUpdateSample = {
  at: number;
  eventKind: string;
  applyMs: number;
  source: string;
};

/** Amostra de tentativa de patch WS (F2). */
export type ChatWsPatchMetricSample = {
  at: number;
  eventName: string;
  eventKind: string;
  applied: boolean;
  reason?: string;
  applyMs?: number;
  scopes?: string[];
};

/** Estatísticas agregadas por tipo de evento (F2). */
export type ChatWsPatchEventKindStat = {
  eventKind: string;
  applied: number;
  fallback: number;
  total: number;
  successRate: number;
  fallbackReasons: Record<string, number>;
};

export type ChatWsPatchStatisticsSnapshot = {
  collectedAt: string;
  totalApplied: number;
  totalFallback: number;
  totalAttempts: number;
  overallSuccessRate: number;
  byEventKind: ChatWsPatchEventKindStat[];
  recentSamples: ChatWsPatchMetricSample[];
};

/** Amostra de acesso F3 (cache vs HTTP). */
export type ChatF3PerfMetricSample = {
  at: number;
  kind: 'listInstances' | 'attendance-counts' | 'reconcile';
  action: 'executed' | 'avoided';
  reason?: string;
  reconcileScope?: 'instances' | 'attendance';
};

export type ChatF3EndpointReductionStat = {
  endpoint: 'listInstances' | 'attendance-counts';
  httpExecuted: number;
  httpAvoided: number;
  totalAccesses: number;
  reductionPercent: number;
};

export type ChatF3PerformanceStatisticsSnapshot = {
  collectedAt: string;
  listInstances: ChatF3EndpointReductionStat;
  attendanceCounts: ChatF3EndpointReductionStat;
  overallReductionPercent: number;
  reconcilesExecuted: number;
  reconcilesAvoided: number;
  reconcileTotalAttempts: number;
  reconcileReductionPercent: number;
  avgMsBetweenReconciles: number | null;
  recentSamples: ChatF3PerfMetricSample[];
};

type BaselineState = {
  http: ChatHttpMetricSample[];
  sockets: ChatSocketMetricSample[];
  timings: ChatTimingMetricSample[];
  realtime: ChatRealtimeUpdateSample[];
  wsPatch: ChatWsPatchMetricSample[];
  wsPatchByKind: Map<
    string,
    { applied: number; fallback: number; reasons: Map<string, number> }
  >;
  f3: {
    listInstancesExecuted: number;
    listInstancesAvoided: number;
    attendanceExecuted: number;
    attendanceAvoided: number;
    reconcilesExecuted: number;
    reconcilesAvoided: number;
    reconcileTimestamps: number[];
    samples: ChatF3PerfMetricSample[];
  };
  openSocketsEstimate: number;
};

const MAX_SAMPLES = 500;

const state: BaselineState = {
  http: [],
  sockets: [],
  timings: [],
  realtime: [],
  wsPatch: [],
  wsPatchByKind: new Map(),
  f3: {
    listInstancesExecuted: 0,
    listInstancesAvoided: 0,
    attendanceExecuted: 0,
    attendanceAvoided: 0,
    reconcilesExecuted: 0,
    reconcilesAvoided: 0,
    reconcileTimestamps: [],
    samples: [],
  },
  openSocketsEstimate: 0,
};

function metricsEnabled(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
}

/** Logs de métricas — somente com CHAT_CORE_METRICS no painel Super Admin. */
function chatCoreMetricsLogEnabled(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_METRICS');
}

function logPatch(event: string, payload: Record<string, unknown>): void {
  if (!chatCoreMetricsLogEnabled()) return;
  console.info(`[chat-core-metrics] ${event}`, payload);
}

function logF3(event: string, payload: Record<string, unknown>): void {
  if (!chatCoreMetricsLogEnabled()) return;
  console.info(`[chat-core-metrics] ${event}`, payload);
}

function pushF3Sample(sample: Omit<ChatF3PerfMetricSample, 'at'>): void {
  const row: ChatF3PerfMetricSample = { at: Date.now(), ...sample };
  pushCapped(state.f3.samples, row);
  logF3('f3_perf', row as unknown as Record<string, unknown>);
}

function reductionPercent(avoided: number, executed: number): number {
  const total = avoided + executed;
  if (total <= 0) return 0;
  return Math.round((avoided / total) * 10000) / 100;
}

function buildEndpointStat(
  endpoint: 'listInstances' | 'attendance-counts',
  executed: number,
  avoided: number,
): ChatF3EndpointReductionStat {
  return {
    endpoint,
    httpExecuted: executed,
    httpAvoided: avoided,
    totalAccesses: executed + avoided,
    reductionPercent: reductionPercent(avoided, executed),
  };
}

function avgMsBetweenTimestamps(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < timestamps.length; i += 1) {
    sum += timestamps[i] - timestamps[i - 1];
  }
  return Math.round(sum / (timestamps.length - 1));
}

/** Registra acesso a listInstances evitado (cache registry) ou executado (HTTP). */
export function recordChatF3ListInstancesAccess(params: {
  avoided: boolean;
  reason?: string;
}): void {
  if (params.avoided) {
    state.f3.listInstancesAvoided += 1;
  } else {
    state.f3.listInstancesExecuted += 1;
  }
  pushF3Sample({
    kind: 'listInstances',
    action: params.avoided ? 'avoided' : 'executed',
    reason: params.reason,
  });
}

/** Registra acesso a attendance-counts evitado (cache/incremental) ou executado (HTTP). */
export function recordChatF3AttendanceCountsAccess(params: {
  avoided: boolean;
  reason?: string;
}): void {
  if (params.avoided) {
    state.f3.attendanceAvoided += 1;
  } else {
    state.f3.attendanceExecuted += 1;
  }
  pushF3Sample({
    kind: 'attendance-counts',
    action: params.avoided ? 'avoided' : 'executed',
    reason: params.reason,
  });
}

/** Registra reconcile HTTP executado (instances ou attendance). */
export function recordChatF3ReconcileExecuted(params: {
  scope: 'instances' | 'attendance';
  reason?: string;
}): void {
  state.f3.reconcilesExecuted += 1;
  state.f3.reconcileTimestamps.push(Date.now());
  if (state.f3.reconcileTimestamps.length > MAX_SAMPLES) {
    state.f3.reconcileTimestamps.splice(0, state.f3.reconcileTimestamps.length - MAX_SAMPLES);
  }
  pushF3Sample({
    kind: 'reconcile',
    action: 'executed',
    reason: params.reason,
    reconcileScope: params.scope,
  });
}

/** Registra reconcile evitado (cache, dedupe in-flight, debounce, incremental WS). */
export function recordChatF3ReconcileAvoided(params: {
  scope: 'instances' | 'attendance';
  reason?: string;
}): void {
  state.f3.reconcilesAvoided += 1;
  pushF3Sample({
    kind: 'reconcile',
    action: 'avoided',
    reason: params.reason,
    reconcileScope: params.scope,
  });
}

/** Snapshot comparativo de redução HTTP F3 (registry + unread engine). */
export function getChatF3PerformanceStatistics(limit = 20): ChatF3PerformanceStatisticsSnapshot {
  const listInstances = buildEndpointStat(
    'listInstances',
    state.f3.listInstancesExecuted,
    state.f3.listInstancesAvoided,
  );
  const attendanceCounts = buildEndpointStat(
    'attendance-counts',
    state.f3.attendanceExecuted,
    state.f3.attendanceAvoided,
  );
  const overallAvoided = listInstances.httpAvoided + attendanceCounts.httpAvoided;
  const overallExecuted = listInstances.httpExecuted + attendanceCounts.httpExecuted;
  const reconcileTotal = state.f3.reconcilesExecuted + state.f3.reconcilesAvoided;

  return {
    collectedAt: new Date().toISOString(),
    listInstances,
    attendanceCounts,
    overallReductionPercent: reductionPercent(overallAvoided, overallExecuted),
    reconcilesExecuted: state.f3.reconcilesExecuted,
    reconcilesAvoided: state.f3.reconcilesAvoided,
    reconcileTotalAttempts: reconcileTotal,
    reconcileReductionPercent: reductionPercent(state.f3.reconcilesAvoided, state.f3.reconcilesExecuted),
    avgMsBetweenReconciles: avgMsBetweenTimestamps(state.f3.reconcileTimestamps),
    recentSamples: state.f3.samples.slice(-limit),
  };
}

export function resetChatF3PerformanceMetrics(): void {
  state.f3.listInstancesExecuted = 0;
  state.f3.listInstancesAvoided = 0;
  state.f3.attendanceExecuted = 0;
  state.f3.attendanceAvoided = 0;
  state.f3.reconcilesExecuted = 0;
  state.f3.reconcilesAvoided = 0;
  state.f3.reconcileTimestamps.length = 0;
  state.f3.samples.length = 0;
  logF3('f3_perf_reset', {});
}

function pushCapped<T>(arr: T[], item: T): void {
  arr.push(item);
  if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
}

function log(event: string, payload: Record<string, unknown>): void {
  if (!metricsEnabled()) return;
  console.info(`[chat-core-metrics] ${event}`, payload);
}

export function recordChatHttpRequest(sample: Omit<ChatHttpMetricSample, 'at'>): void {
  const row: ChatHttpMetricSample = { at: Date.now(), ...sample };
  pushCapped(state.http, row);
  log('http_request', row as unknown as Record<string, unknown>);
  // F5.12 — bridge (no-op se telemetria OFF)
  recordHttpFromBaselineSample({
    endpoint: sample.endpoint,
    method: sample.method,
    source: sample.source,
    durationMs: sample.durationMs,
  });
}

export function recordChatSocket(sample: Omit<ChatSocketMetricSample, 'at'>): void {
  const row: ChatSocketMetricSample = { at: Date.now(), ...sample };
  if (sample.action === 'open') state.openSocketsEstimate += 1;
  if (sample.action === 'close') state.openSocketsEstimate = Math.max(0, state.openSocketsEstimate - 1);
  pushCapped(state.sockets, row);
  log('socket', { ...row, openSocketsEstimate: state.openSocketsEstimate });
}

export function recordChatTiming(sample: Omit<ChatTimingMetricSample, 'at'>): void {
  const row: ChatTimingMetricSample = { at: Date.now(), ...sample };
  pushCapped(state.timings, row);
  log('timing', row as unknown as Record<string, unknown>);
}

export function recordChatRealtimeUpdate(sample: Omit<ChatRealtimeUpdateSample, 'at'>): void {
  const row: ChatRealtimeUpdateSample = { at: Date.now(), ...sample };
  pushCapped(state.realtime, row);
  log('realtime_update', row as unknown as Record<string, unknown>);
}

function getOrCreateWsPatchKindStat(eventKind: string) {
  let row = state.wsPatchByKind.get(eventKind);
  if (!row) {
    row = { applied: 0, fallback: 0, reasons: new Map() };
    state.wsPatchByKind.set(eventKind, row);
  }
  return row;
}

/**
 * Registra tentativa de patch WS (aplicado ou fallback).
 * Coleta sempre em memória; log console somente com CHAT_CORE_METRICS no painel Super Admin.
 */
export function recordChatWsPatchAttempt(
  sample: Omit<ChatWsPatchMetricSample, 'at'>,
): void {
  const row: ChatWsPatchMetricSample = { at: Date.now(), ...sample };
  pushCapped(state.wsPatch, row);

  const kindStat = getOrCreateWsPatchKindStat(sample.eventKind);
  if (sample.applied) {
    kindStat.applied += 1;
  } else {
    kindStat.fallback += 1;
    const reason = sample.reason ?? 'unknown';
    kindStat.reasons.set(reason, (kindStat.reasons.get(reason) ?? 0) + 1);
  }

  logPatch('ws_patch_attempt', row as unknown as Record<string, unknown>);
}

function buildWsPatchEventKindStats(): ChatWsPatchEventKindStat[] {
  const out: ChatWsPatchEventKindStat[] = [];
  for (const [eventKind, stat] of state.wsPatchByKind.entries()) {
    const total = stat.applied + stat.fallback;
    const successRate = total > 0 ? Math.round((stat.applied / total) * 10000) / 100 : 0;
    const fallbackReasons: Record<string, number> = {};
    for (const [reason, count] of stat.reasons.entries()) {
      fallbackReasons[reason] = count;
    }
    out.push({
      eventKind,
      applied: stat.applied,
      fallback: stat.fallback,
      total,
      successRate,
      fallbackReasons,
    });
  }
  out.sort((a, b) => a.eventKind.localeCompare(b.eventKind));
  return out;
}

/** Snapshot das estatísticas operacionais de patch WS (F2). */
export function getChatWsPatchStatistics(limit = 20): ChatWsPatchStatisticsSnapshot {
  const byEventKind = buildWsPatchEventKindStats();
  const totalApplied = byEventKind.reduce((n, r) => n + r.applied, 0);
  const totalFallback = byEventKind.reduce((n, r) => n + r.fallback, 0);
  const totalAttempts = totalApplied + totalFallback;
  const overallSuccessRate =
    totalAttempts > 0 ? Math.round((totalApplied / totalAttempts) * 10000) / 100 : 0;

  return {
    collectedAt: new Date().toISOString(),
    totalApplied,
    totalFallback,
    totalAttempts,
    overallSuccessRate,
    byEventKind,
    recentSamples: state.wsPatch.slice(-limit),
  };
}

export function resetChatWsPatchMetrics(): void {
  state.wsPatch.length = 0;
  state.wsPatchByKind.clear();
  logPatch('ws_patch_reset', {});
}

/** Marks de abertura / load (baseline F0). */
const marks = new Map<string, number>();

export function markChatCoreTiming(label: string): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  marks.set(label, now);
  recordChatTiming({ kind: 'mark', label });
}

export function measureChatCoreTiming(
  from: string,
  to: string,
  kind: ChatTimingMetricSample['kind'] = 'chat_open',
): number | null {
  const a = marks.get(from);
  if (a == null) return null;
  const b = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const durationMs = Math.round(b - a);
  recordChatTiming({ kind, label: `${from}→${to}`, durationMs });
  return durationMs;
}

export type ChatBaselineSnapshot = {
  collectedAt: string;
  phaseFlags: ReturnType<typeof getChatPhaseFlagsSnapshot>;
  httpRequestCount: number;
  socketEventCount: number;
  openSocketsEstimate: number;
  timingSampleCount: number;
  realtimeUpdateCount: number;
  wsPatchStatistics: ChatWsPatchStatisticsSnapshot;
  f3PerformanceStatistics: ChatF3PerformanceStatisticsSnapshot;
  recentHttp: ChatHttpMetricSample[];
  recentRealtime: ChatRealtimeUpdateSample[];
};

/** Snapshot para relatório F0 / comparação entre fases. */
export function getChatBaselineSnapshot(limit = 20): ChatBaselineSnapshot {
  return {
    collectedAt: new Date().toISOString(),
    phaseFlags: getChatPhaseFlagsSnapshot(),
    httpRequestCount: state.http.length,
    socketEventCount: state.sockets.length,
    openSocketsEstimate: state.openSocketsEstimate,
    timingSampleCount: state.timings.length,
    realtimeUpdateCount: state.realtime.length,
    wsPatchStatistics: getChatWsPatchStatistics(limit),
    f3PerformanceStatistics: getChatF3PerformanceStatistics(limit),
    recentHttp: state.http.slice(-limit),
    recentRealtime: state.realtime.slice(-limit),
  };
}

/** Limpa coletores (ex.: troca de sessão). Não afeta UI. */
export function resetChatBaselineMetrics(): void {
  state.http.length = 0;
  state.sockets.length = 0;
  state.timings.length = 0;
  state.realtime.length = 0;
  resetChatWsPatchMetrics();
  resetChatF3PerformanceMetrics();
  state.openSocketsEstimate = 0;
  marks.clear();
  log('reset', {});
}

/**
 * Registra o marco "baseline F0 carregada".
 * Chamado no bootstrap do módulo — não instrumenta a app legada.
 */
export function announceChatCoreFoundationReady(): void {
  log('foundation_ready', {
    phase: 'F0',
    flags: getChatPhaseFlagsSnapshot(),
    note: 'Infrastructure only — no runtime wiring to Chat UI',
  });
}
