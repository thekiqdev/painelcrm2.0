import type { ChatConversation, ChatMessage } from '@/services/chat';

const STORAGE_KEY_V1 = 'painelcrm:chat-page-cache:v1';
const STORAGE_KEY_V2_PREFIX = 'painelcrm:chat-page-cache:v2';
const MAX_MESSAGES_PER_CONVERSATION = 80;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ChatPageCacheScope = {
  tenantId: string;
  userId: string;
};

type ChatPageCacheV1 = {
  version: 1;
  updatedAt: number;
  filtersKey: string;
  conversations: ChatConversation[];
  lastConversationId: string | null;
  messagesByConversation: Record<string, ChatMessage[]>;
};

function scopedKey(scope: ChatPageCacheScope): string {
  const tenant = scope.tenantId || '__owner__';
  const user = scope.userId || '__anon__';
  return `${STORAGE_KEY_V2_PREFIX}:${tenant}:${user}`;
}

function readRaw(scope: ChatPageCacheScope): ChatPageCacheV1 | null {
  try {
    const raw = localStorage.getItem(scopedKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatPageCacheV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.conversations)) return null;
    if (Date.now() - (parsed.updatedAt ?? 0) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRaw(scope: ChatPageCacheScope, data: ChatPageCacheV1): void {
  try {
    localStorage.setItem(scopedKey(scope), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function buildChatPageFiltersKey(parts: Record<string, unknown>): string {
  return JSON.stringify(parts);
}

export function clearChatPageCacheForSession(scope: ChatPageCacheScope): void {
  try {
    localStorage.removeItem(scopedKey(scope));
    localStorage.removeItem(STORAGE_KEY_V1);
  } catch {
    /* ignore */
  }
}

export function readChatPageCache(
  scope: ChatPageCacheScope,
  filtersKey: string,
): {
  conversations: ChatConversation[];
  lastConversationId: string | null;
  messagesByConversation: Record<string, ChatMessage[]>;
} | null {
  const raw = readRaw(scope);
  if (!raw) return null;
  if (raw.filtersKey !== filtersKey) return null;
  return {
    conversations: raw.conversations,
    lastConversationId: raw.lastConversationId,
    messagesByConversation: raw.messagesByConversation ?? {},
  };
}

export function saveChatPageConversations(
  scope: ChatPageCacheScope,
  filtersKey: string,
  conversations: ChatConversation[],
  lastConversationId: string | null,
): void {
  const prev = readRaw(scope);
  const messagesByConversation = prev?.filtersKey === filtersKey ? (prev.messagesByConversation ?? {}) : {};
  writeRaw(scope, {
    version: 1,
    updatedAt: Date.now(),
    filtersKey,
    conversations,
    lastConversationId,
    messagesByConversation,
  });
}

export function saveChatPageMessages(
  scope: ChatPageCacheScope,
  conversationId: string,
  messages: ChatMessage[],
): void {
  const raw = readRaw(scope);
  if (!raw) return;
  const slice = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  writeRaw(scope, {
    ...raw,
    updatedAt: Date.now(),
    messagesByConversation: {
      ...raw.messagesByConversation,
      [conversationId]: slice,
    },
  });
}

export function readChatPageMessages(scope: ChatPageCacheScope, conversationId: string): ChatMessage[] | null {
  const raw = readRaw(scope);
  if (!raw) return null;
  const rows = raw.messagesByConversation?.[conversationId];
  return Array.isArray(rows) && rows.length > 0 ? rows : null;
}

export function saveChatPageLastConversation(scope: ChatPageCacheScope, conversationId: string | null): void {
  const raw = readRaw(scope);
  if (!raw) return;
  writeRaw(scope, { ...raw, updatedAt: Date.now(), lastConversationId: conversationId });
}
