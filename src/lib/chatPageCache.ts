import type { ChatConversation, ChatMessage } from '@/services/chat';

const STORAGE_KEY = 'painelcrm:chat-page-cache:v1';
const MAX_MESSAGES_PER_CONVERSATION = 80;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type ChatPageCacheV1 = {
  version: 1;
  updatedAt: number;
  filtersKey: string;
  conversations: ChatConversation[];
  lastConversationId: string | null;
  messagesByConversation: Record<string, ChatMessage[]>;
};

function readRaw(): ChatPageCacheV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatPageCacheV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.conversations)) return null;
    if (Date.now() - (parsed.updatedAt ?? 0) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRaw(data: ChatPageCacheV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function buildChatPageFiltersKey(parts: Record<string, unknown>): string {
  return JSON.stringify(parts);
}

export function readChatPageCache(filtersKey: string): {
  conversations: ChatConversation[];
  lastConversationId: string | null;
  messagesByConversation: Record<string, ChatMessage[]>;
} | null {
  const raw = readRaw();
  if (!raw) return null;
  if (raw.filtersKey !== filtersKey) return null;
  return {
    conversations: raw.conversations,
    lastConversationId: raw.lastConversationId,
    messagesByConversation: raw.messagesByConversation ?? {},
  };
}

export function saveChatPageConversations(
  filtersKey: string,
  conversations: ChatConversation[],
  lastConversationId: string | null,
): void {
  const prev = readRaw();
  const messagesByConversation = prev?.filtersKey === filtersKey ? (prev.messagesByConversation ?? {}) : {};
  writeRaw({
    version: 1,
    updatedAt: Date.now(),
    filtersKey,
    conversations,
    lastConversationId,
    messagesByConversation,
  });
}

export function saveChatPageMessages(conversationId: string, messages: ChatMessage[]): void {
  const raw = readRaw();
  if (!raw) return;
  const slice = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  writeRaw({
    ...raw,
    updatedAt: Date.now(),
    messagesByConversation: {
      ...raw.messagesByConversation,
      [conversationId]: slice,
    },
  });
}

export function readChatPageMessages(conversationId: string): ChatMessage[] | null {
  const raw = readRaw();
  if (!raw) return null;
  const rows = raw.messagesByConversation?.[conversationId];
  return Array.isArray(rows) && rows.length > 0 ? rows : null;
}

export function saveChatPageLastConversation(conversationId: string | null): void {
  const raw = readRaw();
  if (!raw) return;
  writeRaw({ ...raw, updatedAt: Date.now(), lastConversationId: conversationId });
}
