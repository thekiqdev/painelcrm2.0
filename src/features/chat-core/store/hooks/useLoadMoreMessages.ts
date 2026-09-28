/**
 * F6.1 — hook Load More com guards, scroll preserve e telemetria.
 */

import { useCallback, useRef, useState } from 'react';
import { shouldUseChatDomainStore } from '../flags';
import { loadMessagesCursorCommand } from '../../core/loadMessagesCursor';
import { useConversationCursor } from './useConversationCursor';
import type { LoadMessagesCursorResult } from '../../core/loadMessagesCursor';
import {
  captureScrollAnchor,
  restoreScrollAnchor,
} from '../scrollPreservation';
import {
  logLoadMoreEvent,
  recordLoadMoreClick,
  recordLoadMoreDuplicatePrevented,
  recordLoadMorePage,
  recordLoadMoreScrollRestore,
} from '../../metrics/loadMoreMetrics';
import { nowMs } from '../../metrics/performanceMetrics';

export type UseLoadMoreMessagesResult = {
  loadMore: (scrollElement?: HTMLElement | null) => Promise<LoadMessagesCursorResult | null>;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  enabled: boolean;
  lastResult: LoadMessagesCursorResult | null;
};

export function useLoadMoreMessages(
  conversationId: string | null | undefined,
  options?: { pageSize?: number },
): UseLoadMoreMessagesResult {
  const cursor = useConversationCursor(conversationId);
  const [lastResult, setLastResult] = useState<LoadMessagesCursorResult | null>(null);
  const [pending, setPending] = useState(false);
  const lastRequestedCursorRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const loadMore = useCallback(
    async (scrollElement?: HTMLElement | null) => {
      if (!conversationId || !shouldUseChatDomainStore()) return null;

      // Guards
      if (inFlightRef.current || cursor.loadingMore || pending) {
        recordLoadMoreDuplicatePrevented();
        logLoadMoreEvent('blocked', { conversationId, reason: 'loading' });
        return null;
      }
      if (!cursor.hasMore) {
        logLoadMoreEvent('blocked', { conversationId, reason: 'hasMore=false' });
        return null;
      }

      const requestCursor = cursor.nextCursor;
      if (!requestCursor) {
        logLoadMoreEvent('blocked', { conversationId, reason: 'missing-cursor' });
        return null;
      }
      // Cursor Guard: mesmo cursor já solicitado e resultado manteve o mesmo nextCursor (loop).
      if (
        lastRequestedCursorRef.current === requestCursor &&
        lastResult?.applied &&
        lastResult.nextCursor === requestCursor
      ) {
        recordLoadMoreDuplicatePrevented();
        logLoadMoreEvent('blocked', { conversationId, reason: 'repeated-cursor' });
        return null;
      }

      recordLoadMoreClick();
      logLoadMoreEvent('click', { conversationId, cursor: requestCursor });

      const snap =
        scrollElement && conversationId
          ? captureScrollAnchor(scrollElement, conversationId)
          : null;

      inFlightRef.current = true;
      setPending(true);
      const t0 = nowMs();
      lastRequestedCursorRef.current = requestCursor;

      try {
        logLoadMoreEvent('request', { conversationId, cursor: requestCursor });
        const result = await loadMessagesCursorCommand({
          conversationId,
          cursor: requestCursor,
          pageSize: options?.pageSize,
        });
        setLastResult(result);

        logLoadMoreEvent('prepend', {
          conversationId,
          prepended: result.prepended,
          duplicates: result.duplicatesDiscarded,
        });

        if (snap && scrollElement) {
          const tScroll = nowMs();
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                restoreScrollAnchor(scrollElement, snap);
                recordLoadMoreScrollRestore(nowMs() - tScroll);
                logLoadMoreEvent('restore-scroll', {
                  conversationId,
                  deltaHeight: scrollElement.scrollHeight - snap.scrollHeight,
                });
                resolve();
              });
            });
          });
        }

        const durationMs = Math.round(nowMs() - t0);
        recordLoadMorePage(result.prepended, durationMs);
        logLoadMoreEvent('completed', {
          conversationId,
          durationMs,
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        });

        return result;
      } finally {
        inFlightRef.current = false;
        setPending(false);
      }
    },
    [
      conversationId,
      cursor.hasMore,
      cursor.loadingMore,
      cursor.nextCursor,
      lastResult,
      options?.pageSize,
      pending,
    ],
  );

  return {
    loadMore,
    canLoadMore: cursor.canLoadMore && Boolean(cursor.nextCursor),
    isLoadingMore: cursor.loadingMore || pending,
    hasMore: cursor.hasMore,
    enabled: cursor.enabled,
    lastResult,
  };
}
