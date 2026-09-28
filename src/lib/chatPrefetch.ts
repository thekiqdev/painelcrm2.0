import type { QueryClient } from '@tanstack/react-query';
import { preloadChatPageChunk } from '@/pages/chatLazy';
import { queryClient } from '@/lib/queryClient';
import { chatService } from '@/services/chat';
import {
  ensureChatInstances as loadChatInstancesFromCore,
  fetchChatAttendanceCounts,
  filterEnabledChatInstanceIds,
} from '@/features/chat-core/runtime';
import {
  prefetchFloatingChatLists,
  floatingChatBubbleQueryKey,
  floatingChatConversationsQueryKey,
  FLOATING_CHAT_LIST_STALE_MS,
  FLOATING_CHAT_MESSAGES_STALE_MS,
} from '@/features/floating-chat/floatingChatQueries';
import {
  listBubbleChatConversations,
  listChatConversationsItems,
} from '@/repositories/chatConversationsRepository';

export const CHAT_INSTANCES_STALE_MS = 2 * 60_000;
export const CHAT_CONVERSATIONS_STALE_MS = 90_000;
export const CHAT_UNREAD_STALE_MS = 10_000;

export type ChatInboxScope = 'tenant' | 'owner';

export function chatInstancesQueryKey(tenantId: string, userId: string) {
  return ['chat', 'instances', tenantId, userId] as const;
}

export function chatUnreadQueryKey(tenantId: string, userId: string, instanceIdsKey: string, inboxScope: ChatInboxScope) {
  return ['chat', 'nav-unread', tenantId, userId, instanceIdsKey, inboxScope] as const;
}

/** Agenda trabalho de prefetch com prioridade baixa (não bloqueia UI). */
export function scheduleIdleChatPrefetch(run: () => void | Promise<void>): void {
  const wrapped = () => {
    void Promise.resolve(run()).catch(() => {
      /* prefetch best-effort */
    });
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(wrapped, { timeout: 4500 });
  } else {
    window.setTimeout(wrapped, 900);
  }
}

function enabledInstanceIdsFromList(
  instances: Awaited<ReturnType<typeof loadChatInstancesFromCore>>,
): string[] {
  return filterEnabledChatInstanceIds(instances);
}

export async function ensureChatInstances(
  qc: QueryClient,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const instances = await qc.ensureQueryData({
    queryKey: chatInstancesQueryKey(tenantId, userId),
    queryFn: () => loadChatInstancesFromCore({ reason: 'prefetch' }),
    staleTime: CHAT_INSTANCES_STALE_MS,
  });
  return enabledInstanceIdsFromList(instances);
}

export async function prefetchChatUnread(
  qc: QueryClient,
  tenantId: string,
  userId: string,
  instanceIds: string[],
  inboxScope: ChatInboxScope,
): Promise<void> {
  if (instanceIds.length === 0) return;
  const key = instanceIds.slice().sort().join(',');
  const existing = qc.getQueryData(
    chatUnreadQueryKey(tenantId, userId, key, inboxScope),
  );
  if (existing !== undefined) return;
  await qc.prefetchQuery({
    queryKey: chatUnreadQueryKey(tenantId, userId, key, inboxScope),
    queryFn: async () => {
      const c = await fetchChatAttendanceCounts(
        { instanceIds, inboxScope },
        { reason: 'prefetch' },
      );
      return typeof c.unread === 'number' ? c.unread : 0;
    },
    staleTime: CHAT_UNREAD_STALE_MS,
  });
}

/** Pré-carrega últimas mensagens das conversas recentes (máx. 3 — só primeira render). */
export async function prefetchRecentConversationMessages(
  qc: QueryClient,
  conversationIds: string[],
): Promise<void> {
  const top = conversationIds.slice(0, 3);
  await Promise.all(
    top.map(async (conversationId) => {
      const key = ['floating-chat', 'messages', conversationId] as const;
      if (qc.getQueryData(key) !== undefined) return;
      await qc.prefetchQuery({
        queryKey: key,
        queryFn: async () => {
          const rows = await chatService.getConversationMessages(conversationId);
          return rows;
        },
        staleTime: FLOATING_CHAT_MESSAGES_STALE_MS,
      });
    }),
  );
}

/** Dados críticos da primeira renderização do /chat e float (sem histórico completo). */
export async function prefetchChatCore(
  qc: QueryClient,
  tenantId: string,
  userId: string,
  hasTenantInbox: boolean,
): Promise<void> {
  const instanceIds = await ensureChatInstances(qc, tenantId, userId);
  const inboxScope: ChatInboxScope = hasTenantInbox ? 'tenant' : 'owner';
  if (instanceIds.length === 0) return;

  await Promise.all([
    prefetchFloatingChatLists(qc, instanceIds, inboxScope),
    prefetchChatUnread(qc, tenantId, userId, instanceIds, inboxScope),
    qc.prefetchQuery({
      queryKey: floatingChatConversationsQueryKey(instanceIds, inboxScope, 'mine'),
      queryFn: () =>
        listChatConversationsItems({
          surface: 'sidebar',
          instanceIds,
          inboxScope,
          quickFilter: 'mine',
        }),
      staleTime: CHAT_CONVERSATIONS_STALE_MS,
    }),
    qc.prefetchQuery({
      queryKey: floatingChatConversationsQueryKey(instanceIds, inboxScope, 'unread'),
      queryFn: () =>
        listChatConversationsItems({
          surface: 'sidebar',
          instanceIds,
          inboxScope,
          quickFilter: 'unread',
        }),
      staleTime: CHAT_CONVERSATIONS_STALE_MS,
    }),
    qc.prefetchQuery({
      queryKey: floatingChatBubbleQueryKey(instanceIds, inboxScope),
      queryFn: async () => {
        const recent = await listBubbleChatConversations({
          surface: 'sidebar',
          instanceIds,
          inboxScope,
        });
        await prefetchRecentConversationMessages(
          qc,
          recent.map((c) => c.id),
        );
        return recent;
      },
      staleTime: FLOATING_CHAT_LIST_STALE_MS,
    }),
  ]);
}

/** Alias legado — mantém chunk do Chat + prefetch silencioso. */
export function prefetchFloatChat(tenantId: string, userId: string, hasTenantInbox: boolean): void {
  preloadChatPageChunk();
  scheduleIdleChatPrefetch(() => prefetchChatCore(queryClient, tenantId, userId, hasTenantInbox));
}

export function prefetchChatCoreIdle(tenantId: string, userId: string, hasTenantInbox: boolean): void {
  if (!tenantId || !userId) return;
  preloadChatPageChunk();
  scheduleIdleChatPrefetch(() => prefetchChatCore(queryClient, tenantId, userId, hasTenantInbox));
}
