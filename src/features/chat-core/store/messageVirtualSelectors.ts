/**
 * F6.4 — selectors da virtualização de mensagens.
 */

import type { ChatConversationId } from '../domain/types';
import type { ChatDomainState } from './types';
import { timeSelector } from '../metrics/selectorMetrics';
import type { MessageVirtualizationState } from './messageVirtualizationState';
import { computeVisibleMessageRange } from '../virtualization/messageVirtualEngine';

export function selectMessageVirtualWindow(
  state: ChatDomainState,
): MessageVirtualizationState {
  return timeSelector('selectMessageVirtualWindow', () => state.messageVirtualization);
}

export function selectMessageOverscan(state: ChatDomainState): {
  overscanStart: number;
  overscanEnd: number;
} {
  return timeSelector('selectMessageOverscan', () => ({
    overscanStart: state.messageVirtualization.overscanStart,
    overscanEnd: state.messageVirtualization.overscanEnd,
  }));
}

export function selectMessageRenderCount(state: ChatDomainState): number {
  return timeSelector('selectMessageRenderCount', () => {
    const { overscanStart, overscanEnd, enabled } = state.messageVirtualization;
    if (!enabled || overscanEnd < overscanStart) return 0;
    return overscanEnd - overscanStart + 1;
  });
}

/**
 * IDs na janela overscan da conversa ativa no slice de virtualização.
 */
export function selectVisibleMessages(
  state: ChatDomainState,
  conversationId?: ChatConversationId | null,
): string[] {
  return timeSelector('selectVisibleMessages', () => {
    const v = state.messageVirtualization;
    const cid = conversationId ?? v.conversationId;
    if (!v.enabled || !cid || v.overscanEnd < v.overscanStart) return [];
    const ids = state.messages.byConversationId[cid] ?? [];
    return ids.slice(v.overscanStart, v.overscanEnd + 1);
  });
}

export function selectComputedMessageWindow(
  messageIds: readonly string[],
  scrollTop: number,
  viewportHeight: number,
  heightById?: Record<string, number>,
) {
  return computeVisibleMessageRange({
    messageIds,
    scrollTop,
    viewportHeight,
    heightById,
  });
}
