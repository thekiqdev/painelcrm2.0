import { FLOATING_CHAT_LS_KEY } from './constants';
import type { FloatingChatPanel, FloatingChatPersistedLegacyV1, FloatingChatPersistedStateV1 } from './floatingChatTypes';

function uniqStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    if (typeof x !== 'string' || x.length === 0) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

export function panelsToPersistedState(
  panels: FloatingChatPanel[],
  activeConversationId: string | null,
  listOpen: boolean,
): FloatingChatPersistedStateV1 {
  const openConversationIds = panels.filter((p) => !p.minimized).map((p) => p.conversationId);
  const minimizedOrder = panels.filter((p) => p.minimized).map((p) => p.conversationId);
  return {
    version: 1,
    openConversationIds,
    minimizedConversationIds: [...minimizedOrder],
    minimizedOrder,
    activeConversationId,
    listOpen,
  };
}

export function persistedStateToPanels(p: FloatingChatPersistedStateV1): FloatingChatPanel[] {
  const open = uniqStrings(p.openConversationIds);
  const minOrder = uniqStrings(p.minimizedOrder);
  const openSet = new Set(open);
  const minimizedOnly = minOrder.filter((id) => !openSet.has(id));
  return [
    ...open.map((conversationId) => ({ conversationId, minimized: false as const })),
    ...minimizedOnly.map((conversationId) => ({ conversationId, minimized: true as const })),
  ];
}

function migrateLegacy(raw: FloatingChatPersistedLegacyV1): FloatingChatPersistedStateV1 | null {
  if (raw?.v !== 1 || !Array.isArray(raw.panels)) return null;
  const panels = raw.panels
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
  const activeRaw =
    typeof raw.activeWindowId === 'string' && raw.activeWindowId.length > 0 ? raw.activeWindowId : null;
  const ids = new Set(panels.map((x) => x.conversationId));
  const activeConversationId = activeRaw && ids.has(activeRaw) ? activeRaw : null;
  return panelsToPersistedState(panels, activeConversationId, raw.listOpen === true);
}

export function loadFloatingChatPersisted(): FloatingChatPersistedStateV1 | null {
  try {
    const raw = localStorage.getItem(FLOATING_CHAT_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;

    if (p?.version === 1 && Array.isArray(p.openConversationIds)) {
      const openConversationIds = uniqStrings(p.openConversationIds);
      const minimizedOrder = uniqStrings(p.minimizedOrder ?? p.minimizedConversationIds);
      const minimizedConversationIds = uniqStrings(p.minimizedConversationIds ?? minimizedOrder);
      const activeRaw = p.activeConversationId;
      const activeConversationId =
        typeof activeRaw === 'string' && activeRaw.length > 0 ? activeRaw : null;
      const allIds = new Set([...openConversationIds, ...minimizedOrder]);
      return {
        version: 1,
        openConversationIds,
        minimizedConversationIds,
        minimizedOrder,
        activeConversationId: activeConversationId && allIds.has(activeConversationId) ? activeConversationId : null,
        listOpen: p.listOpen === true,
      };
    }

    return migrateLegacy(p as FloatingChatPersistedLegacyV1);
  } catch {
    return null;
  }
}

export function saveFloatingChatPersisted(state: FloatingChatPersistedStateV1): void {
  try {
    localStorage.setItem(FLOATING_CHAT_LS_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}
