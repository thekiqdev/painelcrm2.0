/**
 * F5.0 — contrato de persistência (stubs).
 * Draft, selection, scroll e filters — implementação em F6+.
 */

import type {
  ChatConversationId,
  ChatDomainPersistence,
  SelectionState,
  UIState,
} from './types';

export function createChatDomainPersistence(): ChatDomainPersistence {
  return {
    loadDraft(_conversationId: ChatConversationId): string | null {
      return null;
    },
    saveDraft(_conversationId: ChatConversationId, _draft: string): void {
      /* noop F5.0 */
    },
    loadSelection(): Partial<SelectionState> | null {
      return null;
    },
    saveSelection(_selection: Partial<SelectionState>): void {
      /* noop F5.0 */
    },
    loadScroll(_conversationId: ChatConversationId): number | null {
      return null;
    },
    saveScroll(_conversationId: ChatConversationId, _offset: number): void {
      /* noop F5.0 */
    },
    loadFilters(): Partial<UIState> | null {
      return null;
    },
    saveFilters(_filters: Partial<UIState>): void {
      /* noop F5.0 */
    },
  };
}
