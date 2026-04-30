import { FLOATING_CHAT_LS_KEY } from './constants';
import type { FloatingChatPersistedV1 } from './floatingChatTypes';

export function loadFloatingChatPersisted(): FloatingChatPersistedV1 | null {
  try {
    const raw = localStorage.getItem(FLOATING_CHAT_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<FloatingChatPersistedV1> & { unreadByConversation?: unknown };
    if (p?.v !== 1 || !Array.isArray(p.panels)) return null;
    const panels = p.panels
      .filter(
        (x) =>
          x &&
          typeof x.conversationId === 'string' &&
          x.conversationId.length > 0 &&
          typeof x.minimized === 'boolean',
      )
      .map((x) => ({
        conversationId: x.conversationId,
        minimized: x.minimized,
      }));
    const activeWindowId =
      typeof p.activeWindowId === 'string' && p.activeWindowId.length > 0 ? p.activeWindowId : null;
    return {
      v: 1,
      listOpen: p.listOpen === true,
      panels,
      activeWindowId: activeWindowId && panels.some((x) => x.conversationId === activeWindowId) ? activeWindowId : null,
    };
  } catch {
    return null;
  }
}

export function saveFloatingChatPersisted(state: FloatingChatPersistedV1): void {
  try {
    localStorage.setItem(FLOATING_CHAT_LS_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}
