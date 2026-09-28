/**
 * F5.1 — comparação shadow Store vs Repository (testes / DEV com CHAT_CORE_METRICS).
 * Nunca bloqueia execução; nunca altera UX.
 */

import { logShadowDev } from './shadowLog';

import type { ChatDomainStore } from './types';

export type StoreShadowComparison = {
  conversationCountMatch: boolean;
  messageCountMatch: boolean;
  storeConversationCount: number;
  repositoryConversationCount: number;
  storeMessageCount: number;
  repositoryMessageCount: number;
};

export function compareConversationCount(
  storeCount: number,
  repositoryCount: number,
): boolean {
  return storeCount === repositoryCount;
}

export function compareMessageCount(storeCount: number, repositoryCount: number): boolean {
  return storeCount === repositoryCount;
}

function readPinnedFromUi(conversation: { pinned?: boolean; raw?: unknown }): boolean {
  if (typeof conversation.pinned === 'boolean') return conversation.pinned;
  const raw = conversation.raw as Record<string, unknown> | undefined;
  if (!raw) return false;
  if (typeof raw.pinned === 'boolean') return raw.pinned;
  const meta = raw.metadata;
  if (meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).pinned === 'boolean') {
    return Boolean((meta as Record<string, unknown>).pinned);
  }
  return false;
}

export function compareFloatingConversationParity(params: {
  repositoryConversations: readonly { id: string; pinned?: boolean; raw?: unknown }[];
  storeConversations: readonly { id: string; pinned?: boolean; raw?: unknown }[];
  repositoryUnreadTotal: number;
  storeUnreadTotal: number;
}): {
  conversationCountMatch: boolean;
  idMatch: boolean;
  orderingMatch: boolean;
  unreadMatch: boolean;
  pinnedMatch: boolean;
  parity: boolean;
} {
  const repositoryIds = params.repositoryConversations.map((c) => c.id);
  const storeIds = params.storeConversations.map((c) => c.id);
  const conversationCountMatch = repositoryIds.length === storeIds.length;
  const idMatch =
    conversationCountMatch && repositoryIds.every((id, index) => storeIds[index] === id);
  const orderingMatch = idMatch;
  const unreadMatch = params.repositoryUnreadTotal === params.storeUnreadTotal;
  const pinnedMatch =
    conversationCountMatch &&
    params.repositoryConversations.every(
      (repo, index) => readPinnedFromUi(repo) === readPinnedFromUi(params.storeConversations[index]!),
    );
  const parity = conversationCountMatch && idMatch && unreadMatch && pinnedMatch;

  if (!parity) {
    logShadowDev('floating conversation parity', {
      conversationCountMatch,
      idMatch,
      orderingMatch,
      unreadMatch,
      pinnedMatch,
      repositoryIds,
      storeIds,
      repositoryUnreadTotal: params.repositoryUnreadTotal,
      storeUnreadTotal: params.storeUnreadTotal,
    });
  }

  return {
    conversationCountMatch,
    idMatch,
    orderingMatch,
    unreadMatch,
    pinnedMatch,
    parity,
  };
}

export function compareStoreVsRepository(params: {
  store: ChatDomainStore;
  repositoryConversations: unknown[] | null | undefined;
  repositoryMessages?: unknown[] | null;
  conversationId?: string | null;
}): StoreShadowComparison {
  const storeConversationCount = params.store.getState().conversations.orderedIds.length;
  const repositoryConversationCount = Array.isArray(params.repositoryConversations)
    ? params.repositoryConversations.length
    : 0;

  const storeMessageCount = params.conversationId
    ? params.store.selectors.selectMessages(params.store.getState(), params.conversationId).length
    : Object.keys(params.store.getState().messages.byId).length;

  const repositoryMessageCount = Array.isArray(params.repositoryMessages)
    ? params.repositoryMessages.length
    : 0;

  const conversationCountMatch = compareConversationCount(
    storeConversationCount,
    repositoryConversationCount,
  );
  const messageCountMatch = compareMessageCount(storeMessageCount, repositoryMessageCount);

  if (!conversationCountMatch || !messageCountMatch) {
    logShadowDev('mismatch', {
      conversationCountMatch,
      messageCountMatch,
      storeConversationCount,
      repositoryConversationCount,
      storeMessageCount,
      repositoryMessageCount,
    });
  }

  return {
    conversationCountMatch,
    messageCountMatch,
    storeConversationCount,
    repositoryConversationCount,
    storeMessageCount,
    repositoryMessageCount,
  };
}

function readMessageTimestamp(message: {
  sent_at?: string | null;
  created_at?: string | null;
  sentAt?: string | null;
}): string | null {
  return message.sent_at ?? message.sentAt ?? message.created_at ?? null;
}

export function compareFloatingMessageParity(params: {
  repositoryMessages: readonly {
    id: string;
    sent_at?: string | null;
    created_at?: string | null;
    status?: string | null;
    direction?: string | null;
  }[];
  storeMessages: readonly {
    id: string;
    sent_at?: string | null;
    created_at?: string | null;
    status?: string | null;
    direction?: string | null;
  }[];
}): {
  messageCountMatch: boolean;
  idMatch: boolean;
  orderingMatch: boolean;
  timestampMatch: boolean;
  statusMatch: boolean;
  senderMatch: boolean;
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
        readMessageTimestamp(repo) === readMessageTimestamp(params.storeMessages[index]!),
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
  const parity =
    messageCountMatch && idMatch && timestampMatch && statusMatch && senderMatch;

  if (!parity) {
    logShadowDev('floating message parity', {
      messageCountMatch,
      idMatch,
      orderingMatch,
      timestampMatch,
      statusMatch,
      senderMatch,
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
    parity,
  };
}
