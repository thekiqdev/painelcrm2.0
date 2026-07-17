/**
 * TF7 E1 — warm Domain Store a partir do chatPageCache (localStorage).
 * Disco nunca é SoT: só acelera paint; loadInbox em background continua (E1).
 */

import type { ChatConversation, ChatMessage } from '@/services/chat';
import {
  readChatPageCache,
  readChatPageMessages,
  type ChatPageCacheScope,
} from '@/lib/chatPageCache';
import { shouldUseChatDomainStore } from '../store/flags';
import { ensureChatDomainStoreSession, getChatDomainStoreSession } from '../store/session';
import {
  applyStoreConversationListInternal,
  applyStoreMessages,
} from '../store/consolidation';
import { logInboxCacheEvent } from './inboxCacheDiag';

export type WarmInboxFromPageCacheParams = {
  scope: ChatPageCacheScope;
  filtersKey: string;
  /** Default true — não sobrescreve Store já hidratada na sessão. */
  onlyIfEmpty?: boolean;
};

export type WarmInboxFromPageCacheResult = {
  warmed: boolean;
  conversationCount: number;
  lastConversationId: string | null;
  messagesWarmed: boolean;
  /** TF7 E2 — `chatPageCache.updatedAt` quando warm aplica. */
  cachedUpdatedAt: number | null;
  reason:
    | 'store_off'
    | 'no_session'
    | 'store_not_empty'
    | 'no_cache'
    | 'empty_cache'
    | 'applied';
};

const EMPTY_RESULT = (
  reason: WarmInboxFromPageCacheResult['reason'],
): WarmInboxFromPageCacheResult => ({
  warmed: false,
  conversationCount: 0,
  lastConversationId: null,
  messagesWarmed: false,
  cachedUpdatedAt: null,
  reason,
});

/**
 * Hidrata Domain Store a partir do cache local (filtersKey deve bater).
 * Retorna lastConversationId para a UI restaurar seleção.
 */
export function warmInboxFromPageCache(
  params: WarmInboxFromPageCacheParams,
): WarmInboxFromPageCacheResult {
  if (!shouldUseChatDomainStore()) return EMPTY_RESULT('store_off');

  ensureChatDomainStoreSession();
  const store = getChatDomainStoreSession();
  if (!store) return EMPTY_RESULT('no_session');

  const onlyIfEmpty = params.onlyIfEmpty !== false;
  if (onlyIfEmpty && store.getState().conversations.orderedIds.length > 0) {
    return EMPTY_RESULT('store_not_empty');
  }

  const cached = readChatPageCache(params.scope, params.filtersKey);
  if (!cached) return EMPTY_RESULT('no_cache');
  if (!cached.conversations.length) return EMPTY_RESULT('empty_cache');

  applyStoreConversationListInternal(cached.conversations as ChatConversation[]);

  let messagesWarmed = false;
  const lastId = cached.lastConversationId;
  if (lastId && cached.conversations.some((c) => c.id === lastId)) {
    const msgs = readChatPageMessages(params.scope, lastId) as ChatMessage[] | null;
    if (msgs?.length) {
      applyStoreMessages(lastId, msgs);
      messagesWarmed = true;
    }
  }

  logInboxCacheEvent('inbox_warm_hit', {
    conversationCount: cached.conversations.length,
    messagesWarmed,
    cachedUpdatedAt: cached.updatedAt > 0 ? cached.updatedAt : null,
  });

  return {
    warmed: true,
    conversationCount: cached.conversations.length,
    lastConversationId: lastId,
    messagesWarmed,
    cachedUpdatedAt: cached.updatedAt > 0 ? cached.updatedAt : null,
    reason: 'applied',
  };
}
