/**
 * F6.3 — Conversation Virtual Engine (puro).
 * Determina quais índices renderizar; não toca Window Cache / Cursor / Commands.
 */

import { createConversationHeightCache, type ConversationHeightCache } from './conversationHeightCache';
import {
  buildGetHeightAtIndex,
  computeConversationWindow,
} from './conversationWindow';
import {
  getConversationVirtualConfig,
  type ConversationVirtualItemLayout,
  type ConversationVirtualWindow,
} from './conversationOverscan';
import {
  logConversationVirtualEvent,
  recordConversationVirtualMove,
  recordConversationVirtualRender,
} from '../metrics/conversationVirtualizationMetrics';

export type ConversationVirtualEngineState = ConversationVirtualWindow & {
  layouts: ConversationVirtualItemLayout[];
};

export type ConversationVirtualEngine = {
  heightCache: ConversationHeightCache;
  compute(params: {
    conversationIds: readonly string[];
    scrollTop: number;
    viewportHeight: number;
  }): ConversationVirtualEngineState;
  setHeight(conversationId: string, height: number): boolean;
  clearHeights(): void;
};

export function createConversationVirtualEngine(
  heightCache: ConversationHeightCache = createConversationHeightCache(),
): ConversationVirtualEngine {
  let lastStart = -1;
  let lastEnd = -1;

  return {
    heightCache,
    compute(params) {
      const { conversationIds, scrollTop, viewportHeight } = params;
      const getHeightAtIndex = buildGetHeightAtIndex(conversationIds, heightCache);
      const window = computeConversationWindow({
        itemCount: conversationIds.length,
        scrollTop,
        viewportHeight,
        getHeightAtIndex,
      });

      const virtualizedRows = Math.max(0, conversationIds.length - window.renderCount);
      recordConversationVirtualRender({
        visibleRows: Math.max(0, window.visibleEnd - window.visibleStart + 1),
        overscanRows: Math.max(
          0,
          window.renderCount - Math.max(0, window.visibleEnd - window.visibleStart + 1),
        ),
        virtualizedRows,
        totalRows: conversationIds.length,
      });

      if (window.overscanStart !== lastStart || window.overscanEnd !== lastEnd) {
        recordConversationVirtualMove();
        logConversationVirtualEvent('move', {
          overscanStart: window.overscanStart,
          overscanEnd: window.overscanEnd,
          visibleStart: window.visibleStart,
          visibleEnd: window.visibleEnd,
        });
        logConversationVirtualEvent('overscan', {
          start: window.overscanStart,
          end: window.overscanEnd,
          count: window.renderCount,
        });
        lastStart = window.overscanStart;
        lastEnd = window.overscanEnd;
      }

      logConversationVirtualEvent('render', {
        renderCount: window.renderCount,
        total: conversationIds.length,
        totalHeight: window.totalHeight,
      });

      return window;
    },
    setHeight(conversationId, height) {
      const prev = heightCache.has(conversationId)
        ? heightCache.get(conversationId)
        : getConversationVirtualConfig().estimatedRowHeight;
      heightCache.set(conversationId, height);
      const next = heightCache.get(conversationId);
      // Histerese: evita loop measure ↔ scrollbar (altura oscila 1px).
      if (Math.abs(prev - next) >= 2) {
        logConversationVirtualEvent('recycle', { conversationId, height: next });
        return true;
      }
      return false;
    },
    clearHeights() {
      heightCache.clear();
    },
  };
}

/** Atalho puro para testes / selectors. */
export function computeVisibleConversationRange(params: {
  conversationIds: readonly string[];
  scrollTop: number;
  viewportHeight: number;
  heightById?: Record<string, number>;
  overscan?: number;
}): ConversationVirtualEngineState {
  const estimated = getConversationVirtualConfig().estimatedRowHeight;
  const cache = createConversationHeightCache(estimated);
  if (params.heightById) {
    for (const [id, h] of Object.entries(params.heightById)) {
      cache.set(id, h);
    }
  }
  return createConversationVirtualEngine(cache).compute({
    conversationIds: params.conversationIds,
    scrollTop: params.scrollTop,
    viewportHeight: params.viewportHeight,
  });
}
