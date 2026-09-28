/**
 * F6.4 — Message Virtual Engine (puro).
 * Não altera Cursor Engine, Window Cache, Commands ou Repository.
 */

import { createMessageHeightCache, type MessageHeightCache } from './messageHeightCache';
import {
  computeConversationOffsets,
  computeConversationWindow,
  findStartIndex,
} from './conversationWindow';
import {
  getMessageVirtualConfig,
  type MessageVirtualItemLayout,
  type MessageVirtualWindow,
} from './messageOverscan';
import {
  logMessageVirtualEvent,
  recordMessageRecycle,
  recordMessageVirtualMove,
  recordMessageVirtualRender,
} from '../metrics/messageVirtualizationMetrics';

export type MessageVirtualEngineState = MessageVirtualWindow & {
  layouts: MessageVirtualItemLayout[];
};

export type MessageVirtualEngine = {
  heightCache: MessageHeightCache;
  compute(params: {
    messageIds: readonly string[];
    scrollTop: number;
    viewportHeight: number;
  }): MessageVirtualEngineState;
  setHeight(messageId: string, height: number): boolean;
  clearHeights(): void;
};

export function createMessageVirtualEngine(
  heightCache: MessageHeightCache = createMessageHeightCache(),
): MessageVirtualEngine {
  let lastStart = -1;
  let lastEnd = -1;
  const config = () => getMessageVirtualConfig();

  return {
    heightCache,
    compute(params) {
      const { messageIds, scrollTop, viewportHeight } = params;
      const estimated = config().estimatedRowHeight;
      const overscan = config().overscan;
      const getHeightAtIndex = (index: number) => {
        const id = messageIds[index];
        if (!id) return estimated;
        return heightCache.get(id);
      };

      const window = computeConversationWindow({
        itemCount: messageIds.length,
        scrollTop,
        viewportHeight,
        getHeightAtIndex,
        overscan,
      });

      const visibleCount = Math.max(0, window.visibleEnd - window.visibleStart + 1);
      const overscanExtra = Math.max(0, window.renderCount - visibleCount);
      const virtualized = Math.max(0, messageIds.length - window.renderCount);

      recordMessageVirtualRender({
        visibleMessages: visibleCount,
        overscanMessages: overscanExtra,
        virtualizedMessages: virtualized,
        totalMessages: messageIds.length,
      });

      if (window.overscanStart !== lastStart || window.overscanEnd !== lastEnd) {
        recordMessageVirtualMove();
        logMessageVirtualEvent('move', {
          overscanStart: window.overscanStart,
          overscanEnd: window.overscanEnd,
          visibleStart: window.visibleStart,
          visibleEnd: window.visibleEnd,
        });
        lastStart = window.overscanStart;
        lastEnd = window.overscanEnd;
      }

      logMessageVirtualEvent('render', {
        renderCount: window.renderCount,
        total: messageIds.length,
        totalHeight: window.totalHeight,
      });

      return window;
    },
    setHeight(messageId, height) {
      const prev = heightCache.has(messageId)
        ? heightCache.get(messageId)
        : config().estimatedRowHeight;
      heightCache.set(messageId, height);
      const next = heightCache.get(messageId);
      // Histerese: evita loop measure ↔ layout (altura oscila 1px).
      if (Math.abs(prev - next) >= 2) {
        recordMessageRecycle();
        logMessageVirtualEvent('recycle', { messageId, height: next });
        return true;
      }
      return false;
    },
    clearHeights() {
      heightCache.clear();
    },
  };
}

/** Helper de teste / selectors. */
export function computeVisibleMessageRange(params: {
  messageIds: readonly string[];
  scrollTop: number;
  viewportHeight: number;
  heightById?: Record<string, number>;
}): MessageVirtualEngineState {
  const cache = createMessageHeightCache();
  if (params.heightById) {
    for (const [id, h] of Object.entries(params.heightById)) cache.set(id, h);
  }
  return createMessageVirtualEngine(cache).compute({
    messageIds: params.messageIds,
    scrollTop: params.scrollTop,
    viewportHeight: params.viewportHeight,
  });
}

export { computeConversationOffsets as computeMessageOffsets, findStartIndex };
