/**
 * F5.12 — contagem de renders (componentes instrumentados).
 */

import { useEffect, useRef } from 'react';
import {
  isChatPerformanceTelemetryEnabled,
  perfCounters,
} from './performanceMetrics';

export type ChatPerfRenderTarget =
  | 'Chat.tsx'
  | 'FloatingConversationWindow'
  | 'FloatingConversationList'
  | 'ConversationSidebar'
  | 'VirtualizedMessageList'
  | 'Composer'
  | 'Header'
  | 'Toolbar';

type RenderBucket = {
  count: number;
  lastAt: number;
};

const byTarget = new Map<ChatPerfRenderTarget, RenderBucket>();

export function recordRender(target: ChatPerfRenderTarget): void {
  if (!isChatPerformanceTelemetryEnabled()) return;
  perfCounters.renders += 1;
  const prev = byTarget.get(target) ?? { count: 0, lastAt: 0 };
  prev.count += 1;
  prev.lastAt = Date.now();
  byTarget.set(target, prev);
}

/** Hook no-op quando telemetria OFF — zero impacto em produção. */
export function useChatPerfRender(target: ChatPerfRenderTarget): void {
  if (isChatPerformanceTelemetryEnabled()) {
    recordRender(target);
  }
  // Mantém assinatura de hook estável (Rules of Hooks).
  useRef(target);
  useEffect(() => undefined, [target]);
}

export function getRenderMetricsSnapshot(): Readonly<{
  total: number;
  byTarget: Record<string, number>;
}> {
  const by: Record<string, number> = {};
  for (const [k, v] of byTarget.entries()) by[k] = v.count;
  return { total: perfCounters.renders, byTarget: by };
}

export function resetRenderMetrics(): void {
  byTarget.clear();
}
