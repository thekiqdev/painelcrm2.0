/**
 * F6.3 — cache de altura por conversa (dynamic height).
 */

import {
  DEFAULT_CONVERSATION_ROW_HEIGHT,
  getConversationVirtualConfig,
} from './conversationOverscan';
import {
  logConversationVirtualEvent,
  recordHeightCacheHit,
  recordHeightCacheMiss,
} from '../metrics/conversationVirtualizationMetrics';

export type ConversationHeightCache = {
  get(id: string, options?: { track?: boolean }): number;
  set(id: string, height: number): void;
  has(id: string): boolean;
  clear(): void;
  size(): number;
  snapshot(): Record<string, number>;
};

export function createConversationHeightCache(
  estimatedHeight: number = getConversationVirtualConfig().estimatedRowHeight,
): ConversationHeightCache {
  const heights = new Map<string, number>();

  return {
    get(id: string, options?: { track?: boolean }): number {
      const hit = heights.get(id);
      if (hit !== undefined) {
        if (options?.track) {
          recordHeightCacheHit();
          logConversationVirtualEvent('cache-hit', { id, height: hit });
        }
        return hit;
      }
      if (options?.track) {
        recordHeightCacheMiss();
        logConversationVirtualEvent('cache-miss', { id, estimated: estimatedHeight });
      }
      return estimatedHeight;
    },
    set(id: string, height: number): void {
      if (!Number.isFinite(height) || height <= 0) return;
      const rounded = Math.round(height);
      const prev = heights.get(id);
      if (prev === rounded) return;
      heights.set(id, rounded);
    },
    has(id: string): boolean {
      return heights.has(id);
    },
    clear(): void {
      heights.clear();
    },
    size(): number {
      return heights.size;
    },
    snapshot(): Record<string, number> {
      const out: Record<string, number> = {};
      for (const [k, v] of heights) out[k] = v;
      return out;
    },
  };
}

export function estimateConversationListHeight(
  itemCount: number,
  estimatedHeight: number = DEFAULT_CONVERSATION_ROW_HEIGHT,
): number {
  return Math.max(0, itemCount) * estimatedHeight;
}
