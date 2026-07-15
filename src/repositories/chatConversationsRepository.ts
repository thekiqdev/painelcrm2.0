/**
 * F4b — Chat Conversations Repository.
 *
 * Único ponto de decisão agregada vs legado por superfície.
 * Não altera Chat Core — módulo independente em src/repositories.
 */

import {
  fetchMergedChatConversations,
  type ChatInboxScope,
  type FetchMergedConversationsParams,
} from '@/lib/chatConversationsFetch';
import { isChatAggregatedSurfaceEnabled, type ChatAggregatedSurface } from '@/lib/chatAggregatedFlags';
import { recordChatConversationsFetch } from '@/lib/chatConversationsMetrics';
import { chatService, type ChatConversation } from '@/services/chat';

function filterWaArchivedList(
  items: ChatConversation[],
  attendanceFilter: FetchMergedConversationsParams['attendanceFilter'],
): ChatConversation[] {
  if (attendanceFilter === 'wa_archived') {
    return items.filter((c) => Boolean(c.wa_archived));
  }
  return items.filter((c) => !c.wa_archived);
}

export type { ChatInboxScope, ChatAggregatedSurface };

export type ChatConversationsListParams = FetchMergedConversationsParams & {
  surface: ChatAggregatedSurface;
  cursor?: string | null;
  limit?: number;
  search?: string;
};

export type ChatConversationsListResult = {
  items: ChatConversation[];
  nextCursor: string | null;
  hasMore: boolean;
  source: 'aggregated' | 'legacy';
};

function buildAggregatedFilters(params: ChatConversationsListParams) {
  const attendance =
    params.attendanceFilter === 'mine' || params.quickFilter === 'mine'
      ? ('mine' as const)
      : params.attendanceFilter || undefined;

  const rawOrigin = params.channelOrigin ?? 'all';
  // F4.1: API agregada lista UazAPI por instanceIds; 'all' → uazapi (oficial em sprint futura).
  const channelOrigin = rawOrigin === 'official' ? ('official' as const) : ('uazapi' as const);

  return {
    instanceIds: params.instanceIds,
    inboxScope: params.inboxScope,
    attendanceFilter: attendance,
    channelOrigin,
    conversationFilter: params.conversationFilter,
    unreadOnly: params.quickFilter === 'unread',
    search: params.search,
    cursor: params.cursor ?? undefined,
    limit: params.limit,
    view: 'list' as const,
    sort: 'last_message_at' as const,
  };
}

async function fetchLegacyList(params: ChatConversationsListParams): Promise<ChatConversationsListResult> {
  const start = performance.now();
  const items = await fetchMergedChatConversations(params);
  const durationMs = Math.round(performance.now() - start);
  const payloadBytes = new TextEncoder().encode(JSON.stringify(items)).length;
  const httpCalls = estimateLegacyHttpCalls(params);

  recordChatConversationsFetch({
    surface: params.surface,
    source: 'legacy',
    fallback: false,
    durationMs,
    payloadBytes,
    itemCount: items.length,
    httpCalls,
  });

  return {
    items,
    nextCursor: null,
    hasMore: false,
    source: 'legacy',
  };
}

function estimateLegacyHttpCalls(params: ChatConversationsListParams): number {
  const { instanceIds, channelOrigin, includeOfficialWhenAll = true } = params;
  if (channelOrigin === 'official') return 1;
  let n = instanceIds.length;
  if (includeOfficialWhenAll && (!channelOrigin || channelOrigin === 'all')) n += 1;
  return Math.max(n, 1);
}

async function fetchAggregatedList(
  params: ChatConversationsListParams,
  options?: { fallbackOnError?: boolean },
): Promise<ChatConversationsListResult> {
  const start = performance.now();
  const fallbackOnError = options?.fallbackOnError !== false;

  try {
    if (params.instanceIds.length === 0) {
      throw new Error('aggregated_requires_instance_ids');
    }

    const { items, meta } = await chatService.getConversationsAggregated(
      buildAggregatedFilters(params),
    );
    const durationMs = Math.round(performance.now() - start);
    const payloadBytes = new TextEncoder().encode(JSON.stringify(items)).length;

    recordChatConversationsFetch({
      surface: params.surface,
      source: 'aggregated',
      fallback: false,
      durationMs,
      payloadBytes,
      itemCount: items.length,
      httpCalls: 1,
    });

    return {
      items: filterWaArchivedList(items, params.attendanceFilter),
      nextCursor: meta.nextCursor,
      hasMore: meta.hasMore,
      source: 'aggregated',
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);

    recordChatConversationsFetch({
      surface: params.surface,
      source: 'aggregated',
      fallback: true,
      durationMs,
      payloadBytes: 0,
      itemCount: 0,
      httpCalls: 1,
      error: message,
    });

    if (!fallbackOnError) throw err;
    const legacy = await fetchLegacyList(params);
    return { ...legacy, source: 'legacy' };
  }
}

/** Lista de conversas — agregada quando flag da superfície ON; senão legado. */
export async function listChatConversations(
  params: ChatConversationsListParams,
): Promise<ChatConversationsListResult> {
  if (isChatAggregatedSurfaceEnabled(params.surface)) {
    return fetchAggregatedList(params);
  }
  return fetchLegacyList(params);
}

/** Compat: retorna apenas items (comportamento antigo de fetchMerged). */
export async function listChatConversationsItems(
  params: ChatConversationsListParams,
): Promise<ChatConversation[]> {
  const result = await listChatConversations(params);
  return result.items;
}

/** Bubble float — até 4 itens; sem merge local quando agregado. */
export async function listBubbleChatConversations(
  params: Omit<ChatConversationsListParams, 'limit' | 'cursor'>,
): Promise<ChatConversation[]> {
  if (isChatAggregatedSurfaceEnabled(params.surface)) {
    const result = await fetchAggregatedList({
      ...params,
      limit: 4,
      quickFilter: 'all',
    });
    return result.items;
  }
  const result = await fetchLegacyList({ ...params, quickFilter: 'all' });
  return result.items.slice(0, 4);
}

export type FindChatConversationParams = {
  surface: ChatAggregatedSurface;
  conversationId: string;
  instanceIds: string[];
  inboxScope: ChatInboxScope;
};

/** Resolve meta de uma conversa sem loop N+1 quando agregado. */
export async function findChatConversationById(
  params: FindChatConversationParams,
): Promise<ChatConversation | null> {
  const { surface, conversationId, instanceIds, inboxScope } = params;

  if (isChatAggregatedSurfaceEnabled(surface) && instanceIds.length > 0) {
    try {
      const { items } = await chatService.getConversationsAggregated({
        instanceIds,
        inboxScope,
        channelOrigin: 'uazapi',
        view: 'list',
        limit: 200,
      });
      const hit = items.find((r) => r.id === conversationId);
      if (hit) return hit;
    } catch {
      /* fallback abaixo */
    }
  }

  if (instanceIds.length > 0) {
    for (const instanceId of instanceIds) {
      try {
        const rows = await chatService.getConversations({ instanceId, inboxScope });
        const hit = rows.find((r) => r.id === conversationId);
        if (hit) return hit;
      } catch {
        /* ignora instância */
      }
    }
  }

  try {
    const rows = await chatService.getConversations({ inboxScope });
    return rows.find((r) => r.id === conversationId) ?? null;
  } catch {
    return null;
  }
}

/** CRM: resolve conversa por client/lead sem merge multi-instância quando agregado. */
export async function listChatConversationsForCrmResolve(params: {
  surface: ChatAggregatedSurface;
  instanceIds: string[];
  inboxScope: ChatInboxScope;
}): Promise<ChatConversation[]> {
  const result = await listChatConversations({
    surface: params.surface,
    instanceIds: params.instanceIds,
    inboxScope: params.inboxScope,
    quickFilter: 'all',
  });
  return result.items;
}
