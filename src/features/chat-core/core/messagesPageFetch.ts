/**
 * F6.0 — tipos e fetch de página de mensagens (cursor + fallback legado).
 */

import { chatService, type ChatMessage } from '@/services/chat';
import { apiClient } from '@/integrations/api/client';
import type { ChatConversationId, ChatDomainMessage } from '../domain/types';
import { mapLegacyMessageToDomain } from '../store/domainMappers';
import {
  decodeLegacyMessageCursor,
  encodeLegacyMessageCursor,
  sortMessagesChronological,
} from '../store/messageMerge';
import { recordChatHttpRequest } from '../metrics/baseline';

export const DEFAULT_MESSAGES_PAGE_SIZE = 50;

export type GetMessagesPageParams = {
  conversationId: ChatConversationId;
  cursor?: string | null;
  pageSize?: number;
  /**
   * F6.1 — sem cursor: retorna só a última página (mensagens mais recentes) e
   * preenche nextCursor/hasMore. Default false = dump integral (compat F5/F6.0).
   */
  latestPage?: boolean;
};

export type MessagesPageResult = {
  messages: ChatDomainMessage[];
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
  source: 'cursor' | 'legacy';
};

type CursorApiPayload = {
  items?: ChatMessage[];
  messages?: ChatMessage[];
  nextCursor?: string | null;
  previousCursor?: string | null;
  hasMore?: boolean;
  cursor?: string | null;
};

function isCursorPayload(data: unknown): data is CursorApiPayload {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const row = data as CursorApiPayload;
  return Array.isArray(row.items) || Array.isArray(row.messages) || 'nextCursor' in row || 'hasMore' in row;
}

/**
 * Página de mensagens com cursor opcional.
 * - Envelope cursor → `source: 'cursor'`.
 * - Array legado:
 *   - sem cursor + latestPage: última página + hasMore (F6.1)
 *   - sem cursor: dump integral, hasMore=false (compat F5)
 *   - com cursor: fatia client-side (mais antigas)
 */
export async function fetchMessagesPage(
  params: GetMessagesPageParams,
): Promise<MessagesPageResult> {
  const pageSize = params.pageSize ?? DEFAULT_MESSAGES_PAGE_SIZE;
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (pageSize > 0) qs.set('limit', String(pageSize));
  if (params.latestPage && !params.cursor) qs.set('latest', '1');
  const query = qs.toString();
  const endpoint = `/api/chat/conversations/${params.conversationId}/messages${
    query ? `?${query}` : ''
  }`;

  recordChatHttpRequest({
    endpoint,
    method: 'GET',
    source: 'messages_page',
    conversationId: params.conversationId,
  });

  const response = await apiClient.get<ChatMessage[] | CursorApiPayload>(endpoint);
  if (response.error) {
    throw new Error(response.error);
  }

  const data = response.data;

  if (isCursorPayload(data)) {
    const raw = data.items ?? data.messages ?? [];
    const messages = sortMessagesChronological(raw.map(mapLegacyMessageToDomain));
    const nextCursor = data.nextCursor ?? data.cursor ?? null;
    return {
      messages,
      nextCursor,
      previousCursor: data.previousCursor ?? null,
      hasMore: data.hasMore ?? Boolean(nextCursor),
      source: 'cursor',
    };
  }

  // Legacy array response
  const all = sortMessagesChronological(
    ((data as ChatMessage[]) || []).map(mapLegacyMessageToDomain),
  );

  if (!params.cursor) {
    if (params.latestPage && pageSize > 0 && all.length > pageSize) {
      const page = all.slice(all.length - pageSize);
      const oldest = page[0]!;
      return {
        messages: page,
        nextCursor: encodeLegacyMessageCursor(oldest.id),
        previousCursor: null,
        hasMore: true,
        source: 'legacy',
      };
    }
    if (params.latestPage) {
      return {
        messages: all,
        nextCursor: null,
        previousCursor: null,
        hasMore: false,
        source: 'legacy',
      };
    }
    // Dump integral — mesmo contrato do getMessages atual (F5).
    return {
      messages: all,
      nextCursor: null,
      previousCursor: null,
      hasMore: false,
      source: 'legacy',
    };
  }

  // Cursor legado client-side: carrega mensagens mais antigas que o cursor.
  const cursorId = decodeLegacyMessageCursor(params.cursor);
  const idx = cursorId ? all.findIndex((m) => m.id === cursorId) : -1;
  if (idx <= 0) {
    return {
      messages: [],
      nextCursor: null,
      previousCursor: params.cursor,
      hasMore: false,
      source: 'legacy',
    };
  }

  const older = all.slice(0, idx);
  const page = older.slice(Math.max(0, older.length - pageSize));
  const oldest = page[0];
  const hasMore = older.length > page.length;
  const nextCursor =
    hasMore && oldest ? encodeLegacyMessageCursor(oldest.id) : null;

  return {
    messages: page,
    nextCursor,
    previousCursor: params.cursor,
    hasMore,
    source: 'legacy',
  };
}

/** @internal — permite testes injetarem implementação. */
let pageFetcher: typeof fetchMessagesPage | null = null;

export function setMessagesPageFetcherForTests(
  fn: typeof fetchMessagesPage | null,
): void {
  pageFetcher = fn;
}

export async function getMessagesPage(
  params: GetMessagesPageParams,
): Promise<MessagesPageResult> {
  if (pageFetcher) return pageFetcher(params);
  return fetchMessagesPage(params);
}

/** Atalho: usa chatService legado quando não há query (compat). */
export async function getMessagesLegacyFull(
  conversationId: ChatConversationId,
): Promise<ChatDomainMessage[]> {
  const rows = await chatService.getConversationMessages(conversationId);
  return sortMessagesChronological(rows.map(mapLegacyMessageToDomain));
}
