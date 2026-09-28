/**
 * F6.3 — cálculo da janela visível + overscan.
 */

import type { ConversationHeightCache } from './conversationHeightCache';
import {
  getConversationVirtualConfig,
  type ConversationVirtualItemLayout,
  type ConversationVirtualWindow,
} from './conversationOverscan';

export type ComputeConversationWindowParams = {
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  getHeightAtIndex: (index: number) => number;
  overscan?: number;
};

export function computeConversationOffsets(
  itemCount: number,
  getHeightAtIndex: (index: number) => number,
): { offsets: number[]; totalHeight: number } {
  const offsets: number[] = new Array(itemCount);
  let top = 0;
  for (let i = 0; i < itemCount; i++) {
    offsets[i] = top;
    top += getHeightAtIndex(i);
  }
  return { offsets, totalHeight: top };
}

/**
 * Binary search: primeiro índice cujo offset+height > scrollTop.
 */
export function findStartIndex(offsets: readonly number[], scrollTop: number): number {
  if (offsets.length === 0) return 0;
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const offset = offsets[mid]!;
    if (offset <= scrollTop) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, Math.min(offsets.length - 1, hi < 0 ? 0 : hi));
}

export function computeConversationWindow(
  params: ComputeConversationWindowParams,
): ConversationVirtualWindow & { layouts: ConversationVirtualItemLayout[] } {
  const config = getConversationVirtualConfig();
  const overscan = params.overscan ?? config.overscan;
  const { itemCount, scrollTop, viewportHeight, getHeightAtIndex } = params;

  if (itemCount <= 0 || viewportHeight <= 0) {
    return {
      visibleStart: 0,
      visibleEnd: -1,
      overscanStart: 0,
      overscanEnd: -1,
      scrollTop: Math.max(0, scrollTop),
      viewportHeight: Math.max(0, viewportHeight),
      totalHeight: 0,
      renderCount: 0,
      layouts: [],
    };
  }

  const { offsets, totalHeight } = computeConversationOffsets(itemCount, getHeightAtIndex);
  const safeScroll = Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight)));
  const visibleStart = findStartIndex(offsets, safeScroll);
  const viewportBottom = safeScroll + viewportHeight;

  let visibleEnd = visibleStart;
  while (visibleEnd < itemCount - 1 && offsets[visibleEnd + 1]! < viewportBottom) {
    visibleEnd += 1;
  }

  const overscanStart = Math.max(0, visibleStart - overscan);
  const overscanEnd = Math.min(itemCount - 1, visibleEnd + overscan);

  const layouts: ConversationVirtualItemLayout[] = [];
  for (let i = overscanStart; i <= overscanEnd; i++) {
    layouts.push({
      index: i,
      offsetTop: offsets[i]!,
      height: getHeightAtIndex(i),
    });
  }

  return {
    visibleStart,
    visibleEnd,
    overscanStart,
    overscanEnd,
    scrollTop: safeScroll,
    viewportHeight,
    totalHeight,
    renderCount: layouts.length,
    layouts,
  };
}

export function buildGetHeightAtIndex(
  ids: readonly string[],
  heightCache: ConversationHeightCache,
): (index: number) => number {
  return (index: number) => {
    const id = ids[index];
    if (!id) return getConversationVirtualConfig().estimatedRowHeight;
    return heightCache.get(id);
  };
}
