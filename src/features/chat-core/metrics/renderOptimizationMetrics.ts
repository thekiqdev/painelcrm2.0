/**
 * F6.5 — telemetria de otimização de render (DEV + CHAT_CORE_METRICS).
 */

import { isChatPerformanceTelemetryEnabled, nowMs } from './performanceMetrics';

type RenderOptimizationMetrics = {
  conversationRowRenders: number;
  messageRowRenders: number;
  selectorHits: number;
  selectorMisses: number;
  subscriptionSkips: number;
  batchedDispatches: number;
  batchedActionCount: number;
  rerenderCount: number;
  renderCostSamples: number;
  renderCostTotalMs: number;
};

const metrics: RenderOptimizationMetrics = {
  conversationRowRenders: 0,
  messageRowRenders: 0,
  selectorHits: 0,
  selectorMisses: 0,
  subscriptionSkips: 0,
  batchedDispatches: 0,
  batchedActionCount: 0,
  rerenderCount: 0,
  renderCostSamples: 0,
  renderCostTotalMs: 0,
};

function enabled(): boolean {
  return isChatPerformanceTelemetryEnabled();
}

export function logRenderOptimizationEvent(
  event: 'selector-hit' | 'selector-miss' | 'batch' | 'skip-render' | 'rerender',
  payload: Record<string, unknown> = {},
): void {
  if (!enabled()) return;
  console.info(`[RenderOptimization] ${event}`, payload);
}

export function recordSelectorHit(name?: string): void {
  if (!enabled()) return;
  metrics.selectorHits += 1;
  logRenderOptimizationEvent('selector-hit', name ? { name } : {});
}

export function recordSelectorMiss(name?: string): void {
  if (!enabled()) return;
  metrics.selectorMisses += 1;
  logRenderOptimizationEvent('selector-miss', name ? { name } : {});
}

export function recordSubscriptionSkip(name?: string): void {
  if (!enabled()) return;
  metrics.subscriptionSkips += 1;
  logRenderOptimizationEvent('skip-render', name ? { name, reason: 'subscription' } : { reason: 'subscription' });
}

export function recordBatchedDispatch(actionCount: number): void {
  if (!enabled()) return;
  metrics.batchedDispatches += 1;
  metrics.batchedActionCount += Math.max(0, actionCount);
  logRenderOptimizationEvent('batch', { actionCount });
}

export function recordConversationRowRender(): void {
  if (!enabled()) return;
  metrics.conversationRowRenders += 1;
  metrics.rerenderCount += 1;
  logRenderOptimizationEvent('rerender', { target: 'conversation-row' });
}

export function recordMessageRowRender(): void {
  if (!enabled()) return;
  metrics.messageRowRenders += 1;
  metrics.rerenderCount += 1;
  logRenderOptimizationEvent('rerender', { target: 'message-row' });
}

export function recordRenderCost(durationMs: number): void {
  if (!enabled()) return;
  metrics.renderCostSamples += 1;
  metrics.renderCostTotalMs += Math.max(0, durationMs);
}

export function getRenderOptimizationMetricsSnapshot(): Readonly<{
  conversationRowRenders: number;
  messageRowRenders: number;
  selectorHits: number;
  selectorMisses: number;
  subscriptionSkips: number;
  batchedDispatches: number;
  rerenderReduction: number;
  averageRenderCost: number;
}> {
  const totalSelector = metrics.selectorHits + metrics.selectorMisses;
  const rerenderReduction =
    totalSelector > 0
      ? Math.round((metrics.selectorHits / totalSelector) * 1000) / 10
      : 0;
  return {
    conversationRowRenders: metrics.conversationRowRenders,
    messageRowRenders: metrics.messageRowRenders,
    selectorHits: metrics.selectorHits,
    selectorMisses: metrics.selectorMisses,
    subscriptionSkips: metrics.subscriptionSkips,
    batchedDispatches: metrics.batchedDispatches,
    rerenderReduction,
    averageRenderCost:
      metrics.renderCostSamples > 0
        ? Math.round((metrics.renderCostTotalMs / metrics.renderCostSamples) * 100) / 100
        : 0,
  };
}

export function resetRenderOptimizationMetrics(): void {
  metrics.conversationRowRenders = 0;
  metrics.messageRowRenders = 0;
  metrics.selectorHits = 0;
  metrics.selectorMisses = 0;
  metrics.subscriptionSkips = 0;
  metrics.batchedDispatches = 0;
  metrics.batchedActionCount = 0;
  metrics.rerenderCount = 0;
  metrics.renderCostSamples = 0;
  metrics.renderCostTotalMs = 0;
}

/** Utilitário de teste / instrumentação. */
export function measureRenderCost<T>(run: () => T): T {
  if (!enabled()) return run();
  const t0 = nowMs();
  try {
    return run();
  } finally {
    recordRenderCost(nowMs() - t0);
  }
}
