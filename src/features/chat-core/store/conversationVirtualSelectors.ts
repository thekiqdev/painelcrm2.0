/**
 * F6.3 — selectors da virtualização de conversas.
 */

import type { ChatDomainState } from './types';
import { timeSelector } from '../metrics/selectorMetrics';
import type { ConversationVirtualizationState } from './conversationVirtualizationState';
import { computeVisibleConversationRange } from '../virtualization/conversationVirtualEngine';
import { selectConversationIds } from './conversationSelectors';

export function selectConversationVirtualWindow(
  state: ChatDomainState,
): ConversationVirtualizationState {
  return timeSelector(
    'selectConversationVirtualWindow',
    () => state.conversationVirtualization,
  );
}

export function selectConversationOverscan(state: ChatDomainState): {
  overscanStart: number;
  overscanEnd: number;
} {
  return timeSelector('selectConversationOverscan', () => ({
    overscanStart: state.conversationVirtualization.overscanStart,
    overscanEnd: state.conversationVirtualization.overscanEnd,
  }));
}

export function selectConversationRenderCount(state: ChatDomainState): number {
  return timeSelector('selectConversationRenderCount', () => {
    const { overscanStart, overscanEnd, enabled } = state.conversationVirtualization;
    if (!enabled || overscanEnd < overscanStart) return 0;
    return overscanEnd - overscanStart + 1;
  });
}

/**
 * IDs na janela overscan (com base no estado sincronizado + orderedIds do store).
 * Para a sidebar filtrada, o hook usa o engine diretamente sobre a lista filtrada.
 */
export function selectVisibleConversations(state: ChatDomainState): string[] {
  return timeSelector('selectVisibleConversations', () => {
    const ids = selectConversationIds(state);
    const v = state.conversationVirtualization;
    if (!v.enabled || ids.length === 0 || v.overscanEnd < v.overscanStart) {
      return [];
    }
    return ids.slice(v.overscanStart, v.overscanEnd + 1);
  });
}

/** Helper de teste: calcula janela sem mutar store. */
export function selectComputedConversationWindow(
  conversationIds: readonly string[],
  scrollTop: number,
  viewportHeight: number,
  heightById?: Record<string, number>,
) {
  return computeVisibleConversationRange({
    conversationIds,
    scrollTop,
    viewportHeight,
    heightById,
  });
}
