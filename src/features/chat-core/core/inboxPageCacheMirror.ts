/**
 * TF7 E3 — espelho Domain Store → chatPageCache (disco nunca SoT).
 * Após GET / patches WS, mantém localStorage alinhado para warm E1 no próximo F5.
 */

import {
  saveChatPageConversations,
  saveChatPageMessages,
  type ChatPageCacheScope,
} from '@/lib/chatPageCache';
import { DEFAULT_INBOX_PAGE_SIZE } from '@/repositories/chatConversationsRepository';
import { shouldUseChatDomainStore } from '../store/flags';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../store/session';
import { selectConversationsForUi } from '../store/conversationSelectors';
import { selectMessagesForUi } from '../store/messageSelectors';
import type { ChatDomainAction } from '../store/types';

/** Cap alinhado à 1ª página (TF6); evita localStorage inchado. */
export const INBOX_PAGE_CACHE_MIRROR_MAX = DEFAULT_INBOX_PAGE_SIZE;

const MIRROR_DEBOUNCE_MS = 800;

export type InboxPageCacheMirrorContext = {
  scope: ChatPageCacheScope;
  filtersKey: string;
  getLastConversationId: () => string | null;
};

function isMirrorRelevantAction(action: ChatDomainAction): boolean {
  const t = action.type;
  return (
    t === 'conversations/set' ||
    t === 'conversations/upsert' ||
    t === 'conversations/remove' ||
    t === 'messages/set' ||
    t === 'messages/append' ||
    t === 'messages/update' ||
    t === 'messages/prepend' ||
    t === 'hydrate/partial'
  );
}

export function mirrorStoreInboxToPageCache(
  scope: ChatPageCacheScope,
  filtersKey: string,
  lastConversationId: string | null,
): boolean {
  if (!shouldUseChatDomainStore()) return false;
  if (!scope.userId) return false;
  const store = getChatDomainStoreSession() ?? ensureChatDomainStoreSession();
  if (!store) return false;
  const items = selectConversationsForUi(store.getState()).slice(0, INBOX_PAGE_CACHE_MIRROR_MAX);
  if (items.length === 0) return false;
  saveChatPageConversations(scope, filtersKey, items, lastConversationId);
  return true;
}

export function mirrorStoreMessagesToPageCache(
  scope: ChatPageCacheScope,
  conversationId: string,
): boolean {
  if (!shouldUseChatDomainStore()) return false;
  if (!scope.userId || !conversationId) return false;
  const store = getChatDomainStoreSession();
  if (!store) return false;
  const msgs = selectMessagesForUi(store.getState(), conversationId);
  if (msgs.length === 0) return false;
  saveChatPageMessages(scope, conversationId, msgs);
  return true;
}

/**
 * Assina o Domain Store e espelha inbox (debounce) em writes relevantes.
 * Retorna unsubscribe.
 */
export function attachInboxPageCacheMirror(ctx: InboxPageCacheMirrorContext): () => void {
  if (!shouldUseChatDomainStore()) return () => undefined;
  const store = getChatDomainStoreSession() ?? ensureChatDomainStoreSession();
  if (!store) return () => undefined;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    mirrorStoreInboxToPageCache(ctx.scope, ctx.filtersKey, ctx.getLastConversationId());
    const lastId = ctx.getLastConversationId();
    if (lastId) {
      mirrorStoreMessagesToPageCache(ctx.scope, lastId);
    }
  };

  const unsub = store.subscribe((_state, action) => {
    if (!isMirrorRelevantAction(action)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, MIRROR_DEBOUNCE_MS);
  });

  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}
