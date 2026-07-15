/**
 * F5.12 — subscriptions do Domain Store por hook.
 */

import {
  isChatPerformanceTelemetryEnabled,
  perfCounters,
} from './performanceMetrics';

export type ChatPerfSubscriptionHook =
  | 'useChatConversationList'
  | 'useChatMessages'
  | 'useChatSelection'
  | 'useFloatingConversationListData'
  | 'useFloatingConversationMessages'
  | 'unknown';

const byHook = new Map<string, number>();
const activeByHook = new Map<string, number>();

export function recordSubscriptionNotify(hook: ChatPerfSubscriptionHook = 'unknown'): void {
  if (!isChatPerformanceTelemetryEnabled()) return;
  perfCounters.subscriptions += 1;
  byHook.set(hook, (byHook.get(hook) ?? 0) + 1);
}

export function recordSubscriptionAttach(hook: ChatPerfSubscriptionHook): () => void {
  if (!isChatPerformanceTelemetryEnabled()) return () => undefined;
  activeByHook.set(hook, (activeByHook.get(hook) ?? 0) + 1);
  return () => {
    activeByHook.set(hook, Math.max(0, (activeByHook.get(hook) ?? 1) - 1));
  };
}

export function getSubscriptionMetricsSnapshot(): Readonly<{
  notifyTotal: number;
  byHook: Record<string, number>;
  activeByHook: Record<string, number>;
}> {
  const by: Record<string, number> = {};
  for (const [k, v] of byHook.entries()) by[k] = v;
  const active: Record<string, number> = {};
  for (const [k, v] of activeByHook.entries()) active[k] = v;
  return {
    notifyTotal: perfCounters.subscriptions,
    byHook: by,
    activeByHook: active,
  };
}

export function resetSubscriptionMetrics(): void {
  byHook.clear();
  activeByHook.clear();
}
