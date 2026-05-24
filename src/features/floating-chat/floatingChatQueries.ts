import type { QueryClient } from '@tanstack/react-query';
import {
  fetchBubbleRecentConversations,
  fetchMergedChatConversations,
  type ChatInboxScope,
} from '@/lib/chatConversationsFetch';

/** Lista quente — reutilizar ao reabrir float/lista. */
export const FLOATING_CHAT_LIST_STALE_MS = 3 * 60_000;
export const FLOATING_CHAT_MESSAGES_STALE_MS = 2 * 60_000;
export const FLOATING_CHAT_META_STALE_MS = 5 * 60_000;

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
  void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversations'] });
  void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'bubble-recent'] });
  void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'minimized-meta'] });
}

export function invalidateFloatingChatConversationMeta(
  queryClient: QueryClient,
  conversationId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: ['floating-chat', 'conversation-meta', conversationId],
  });
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
      queryFn: () => fetchBubbleRecentConversations(instanceIds, inboxScope),
      staleTime: FLOATING_CHAT_LIST_STALE_MS,
    }),
    queryClient.prefetchQuery({
      queryKey: floatingChatConversationsQueryKey(instanceIds, inboxScope, 'all'),
      queryFn: () =>
        fetchMergedChatConversations({
          instanceIds,
          inboxScope,
          quickFilter: 'all',
        }),
      staleTime: FLOATING_CHAT_LIST_STALE_MS,
    }),
  ]);
}
