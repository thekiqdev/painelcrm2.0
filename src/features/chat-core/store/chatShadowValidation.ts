/**
 * F5.4 — shadow parity Chat Principal (testes / DEV com CHAT_CORE_METRICS).
 */

import type { ChatConversation, ChatMessage } from '@/services/chat';
import { logShadowDev } from './shadowLog';

export function compareChatConversationParity(params: {
  repositoryConversations: readonly ChatConversation[];
  storeConversations: readonly ChatConversation[];
  selectedConversationId?: string | null;
  storeSelectedConversationId?: string | null;
  repositoryLoading?: boolean;
  storeLoading?: boolean;
}): {
  conversationCountMatch: boolean;
  idMatch: boolean;
  orderingMatch: boolean;
  unreadMatch: boolean;
  selectedMatch: boolean;
  loadingMatch: boolean;
  parity: boolean;
} {
  const repositoryIds = params.repositoryConversations.map((c) => c.id);
  const storeIds = params.storeConversations.map((c) => c.id);
  const conversationCountMatch = repositoryIds.length === storeIds.length;
  const idMatch =
    conversationCountMatch && repositoryIds.every((id, index) => storeIds[index] === id);
  const orderingMatch = idMatch;
  const repositoryUnread = params.repositoryConversations.reduce(
    (n, c) => n + (c.unreadCount ?? 0),
    0,
  );
  const storeUnread = params.storeConversations.reduce((n, c) => n + (c.unreadCount ?? 0), 0);
  const unreadMatch = repositoryUnread === storeUnread;
  const selectedMatch =
    (params.selectedConversationId ?? null) === (params.storeSelectedConversationId ?? null);
  const loadingMatch = Boolean(params.repositoryLoading) === Boolean(params.storeLoading);
  const parity =
    conversationCountMatch && idMatch && unreadMatch && selectedMatch && loadingMatch;

  if (!parity) {
    logShadowDev('chat conversation parity', {
      conversationCountMatch,
      idMatch,
      orderingMatch,
      unreadMatch,
      selectedMatch,
      loadingMatch,
      repositoryIds,
      storeIds,
    });
  }

  return {
    conversationCountMatch,
    idMatch,
    orderingMatch,
    unreadMatch,
    selectedMatch,
    loadingMatch,
    parity,
  };
}

export function compareChatMessagesParity(params: {
  repositoryMessages: readonly ChatMessage[];
  storeMessages: readonly ChatMessage[];
  repositoryLoading?: boolean;
  storeLoading?: boolean;
}): {
  messageCountMatch: boolean;
  idMatch: boolean;
  orderingMatch: boolean;
  timestampMatch: boolean;
  statusMatch: boolean;
  senderMatch: boolean;
  loadingMatch: boolean;
  parity: boolean;
} {
  const repositoryIds = params.repositoryMessages.map((m) => m.id);
  const storeIds = params.storeMessages.map((m) => m.id);
  const messageCountMatch = repositoryIds.length === storeIds.length;
  const idMatch =
    messageCountMatch && repositoryIds.every((id, index) => storeIds[index] === id);
  const orderingMatch = idMatch;
  const timestampMatch =
    messageCountMatch &&
    params.repositoryMessages.every(
      (repo, index) =>
        (repo.sent_at ?? repo.created_at ?? null) ===
        (params.storeMessages[index]?.sent_at ?? params.storeMessages[index]?.created_at ?? null),
    );
  const statusMatch =
    messageCountMatch &&
    params.repositoryMessages.every(
      (repo, index) => (repo.status ?? null) === (params.storeMessages[index]?.status ?? null),
    );
  const senderMatch =
    messageCountMatch &&
    params.repositoryMessages.every(
      (repo, index) =>
        (repo.direction ?? null) === (params.storeMessages[index]?.direction ?? null),
    );
  const loadingMatch = Boolean(params.repositoryLoading) === Boolean(params.storeLoading);
  const parity =
    messageCountMatch && idMatch && timestampMatch && statusMatch && senderMatch && loadingMatch;

  if (!parity) {
    logShadowDev('chat messages parity', {
      messageCountMatch,
      idMatch,
      orderingMatch,
      timestampMatch,
      statusMatch,
      senderMatch,
      loadingMatch,
      repositoryIds,
      storeIds,
    });
  }

  return {
    messageCountMatch,
    idMatch,
    orderingMatch,
    timestampMatch,
    statusMatch,
    senderMatch,
    loadingMatch,
    parity,
  };
}
