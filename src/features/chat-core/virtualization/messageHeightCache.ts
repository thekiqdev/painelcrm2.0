/**
 * F6.4 — cache de altura por mensagem.
 */

import { getMessageVirtualConfig } from './messageOverscan';
import {
  logMessageVirtualEvent,
  recordMessageHeightCacheHit,
  recordMessageHeightCacheMiss,
} from '../metrics/messageVirtualizationMetrics';

export type MessageHeightCache = {
  get(id: string, options?: { track?: boolean }): number;
  set(id: string, height: number): void;
  has(id: string): boolean;
  clear(): void;
  size(): number;
  snapshot(): Record<string, number>;
};

export function createMessageHeightCache(
  estimatedHeight: number = getMessageVirtualConfig().estimatedRowHeight,
): MessageHeightCache {
  const heights = new Map<string, number>();

  return {
    get(id, options) {
      const hit = heights.get(id);
      if (hit !== undefined) {
        if (options?.track) {
          recordMessageHeightCacheHit();
          logMessageVirtualEvent('cache-hit', { id, height: hit });
        }
        return hit;
      }
      if (options?.track) {
        recordMessageHeightCacheMiss();
        logMessageVirtualEvent('cache-miss', { id, estimated: estimatedHeight });
      }
      return estimatedHeight;
    },
    set(id, height) {
      if (!Number.isFinite(height) || height <= 0) return;
      const rounded = Math.round(height);
      if (heights.get(id) === rounded) return;
      heights.set(id, rounded);
    },
    has(id) {
      return heights.has(id);
    },
    clear() {
      heights.clear();
    },
    size() {
      return heights.size;
    },
    snapshot() {
      const out: Record<string, number> = {};
      for (const [k, v] of heights) out[k] = v;
      return out;
    },
  };
}
