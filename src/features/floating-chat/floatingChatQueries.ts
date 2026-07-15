import type { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_INBOX_PAGE_SIZE,
  listBubbleChatConversations,
  listChatConversationsItems,
  type ChatInboxScope,
} from '@/repositories/chatConversationsRepository';
import { shouldUseChatDomainStore } from '@/features/chat-core/store/flags';

/** Lista quente — reutilizar ao reabrir float/lista. */
export const FLOATING_CHAT_LIST_STALE_MS = 3 * 60_000;
export const FLOATING_CHAT_MESSAGES_STALE_MS = 2 * 60_000;
export const FLOATING_CHAT_META_STALE_MS = 5 * 60_000;

/** TF6 — debounce de invalidação de agregados (prod mais agressivo). */
export const FLOATING_AGGREGATE_INVALIDATE_DEBOUNCE_MS =
  import.meta.env.PROD ? 600 : 120;

export function floatingChatConversationsQueryKey(
  instanceIds: string[],
  inboxScope: ChatInboxScope,
  quick: string,
): readonly ['floating-chat', 'conversations', string, ChatInboxScope, string] {
  return ['floating-chat', 'conversations', instanceIds.join(','), inboxScope, quick];
}

export function floatingChatBubbleQueryKey(
  instanceIds: string[],
  inboxScope: ChatInboxScope,
): readonly ['floating-chat', 'bubble-recent', string, ChatInboxScope] {
  return ['floating-chat', 'bubble-recent', instanceIds.join(','), inboxScope];
}

/** Invalida só listas/agregados — não mensagens abertas. */
export function invalidateFloatingChatAggregates(queryClient: QueryClient): void {
  // TF6 — com Domain Store ON a lista principal vem do Store (WS patch); evita refetch storm.
  if (!shouldUseChatDomainStore()) {
    void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversations'] });
    void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'minimized-meta'] });
  }
  // Bubble ainda é React Query mesmo com Store ON.
  void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'bubble-recent'] });
}

export function invalidateFloatingChatConversationMeta(
  queryClient: QueryClient,
  conversationId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: ['floating-chat', 'conversation-meta', conversationId],
  });
}

export function invalidateFloatingChatMessages(
  queryClient: QueryClient,
  conversationId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: ['floating-chat', 'messages', conversationId],
  });
}

/** CRM profile + listas — nunca root `['floating-chat']`. Prefixo cobre keys com link SoT (Sprint 4). */
export function invalidateFloatingChatCrmSurfaces(
  queryClient: QueryClient,
  conversationId?: string,
): void {
  if (conversationId) {
    void queryClient.invalidateQueries({
      queryKey: ['floating-chat', 'conversation-crm-profile', conversationId],
    });
  }
  invalidateFloatingChatAggregates(queryClient);
}

// MB-020 — coalesce bursts de invalidate de agregados
let aggregateTimer: ReturnType<typeof setTimeout> | null = null;
let aggregatePending: QueryClient | null = null;
let coalesceCount = 0;
let coalesceFlushes = 0;

export function getFloatingInvalidateCoalesceStats(): {
  scheduled: number;
  flushes: number;
} {
  return { scheduled: coalesceCount, flushes: coalesceFlushes };
}

export function resetFloatingInvalidateCoalesceStatsForTests(): void {
  if (aggregateTimer) clearTimeout(aggregateTimer);
  aggregateTimer = null;
  aggregatePending = null;
  coalesceCount = 0;
  coalesceFlushes = 0;
}

/** Agenda invalidação de listas Float com debounce (storm reduction). */
export function scheduleInvalidateFloatingChatAggregates(
  queryClient: QueryClient,
  delayMs = FLOATING_AGGREGATE_INVALIDATE_DEBOUNCE_MS,
): void {
  coalesceCount += 1;
  aggregatePending = queryClient;
  if (aggregateTimer) clearTimeout(aggregateTimer);
  aggregateTimer = setTimeout(() => {
    aggregateTimer = null;
    const qc = aggregatePending;
    aggregatePending = null;
    if (!qc) return;
    coalesceFlushes += 1;
    invalidateFloatingChatAggregates(qc);
  }, delayMs);
}

export async function prefetchFloatingChatLists(
  queryClient: QueryClient,
  instanceIds: string[],
  inboxScope: ChatInboxScope,
): Promise<void> {
  if (instanceIds.length === 0) return;
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: floatingChatBubbleQueryKey(instanceIds, inboxScope),
      queryFn: () =>
        listBubbleChatConversations({
          surface: 'float',
          instanceIds,
          inboxScope,
        }),
      staleTime: FLOATING_CHAT_LIST_STALE_MS,
    }),
    queryClient.prefetchQuery({
      queryKey: floatingChatConversationsQueryKey(instanceIds, inboxScope, 'all'),
      queryFn: () =>
        listChatConversationsItems({
          surface: 'float',
          instanceIds,
          inboxScope,
          quickFilter: 'all',
          limit: DEFAULT_INBOX_PAGE_SIZE,
        }),
      staleTime: FLOATING_CHAT_LIST_STALE_MS,
    }),
  ]);
}
