/**
 * F5.9 — fetch unificado de inbox (Repository only, sem escrita no Store).
 */

import {
  DEFAULT_INBOX_PAGE_SIZE,
  listChatConversations,
  type ChatConversationsListResult,
} from '@/repositories/chatConversationsRepository';
import type { ChatAggregatedSurface } from '@/lib/chatAggregatedFlags';
import type { FetchMergedConversationsParams } from '@/lib/chatConversationsFetch';
import type { ChatConversation } from '@/services/chat';
import type { ChatInboxScope, ChatInstanceId } from '../domain/types';
import { recordHttpMetric } from '../metrics/httpMetrics';
import { nowMs } from '../metrics/performanceMetrics';

export type LoadInboxSurface = ChatAggregatedSurface | 'core' | 'bootstrap';

export type LoadInboxFetchParams = FetchMergedConversationsParams & {
  surface?: LoadInboxSurface;
  cursor?: string | null;
  limit?: number;
  search?: string;
};

function resolveAggregatedSurface(surface: LoadInboxSurface | undefined): ChatAggregatedSurface {
  if (!surface || surface === 'core' || surface === 'bootstrap') {
    return 'chat';
  }
  return surface;
}

/** Busca lista de conversas via Repository (agregado ou legado por superfície). */
export async function fetchInboxConversationsPage(
  params: LoadInboxFetchParams,
): Promise<ChatConversationsListResult> {
  const {
    instanceIds,
    inboxScope,
    quickFilter = 'all',
    attendanceFilter,
    channelOrigin = 'all',
    conversationFilter,
    includeOfficialWhenAll = channelOrigin === 'all',
    surface,
    cursor,
    limit = DEFAULT_INBOX_PAGE_SIZE,
    search,
  } = params;

  const t0 = nowMs();
  const result = await listChatConversations({
    surface: resolveAggregatedSurface(surface),
    instanceIds: instanceIds as ChatInstanceId[],
    inboxScope: inboxScope as ChatInboxScope,
    quickFilter,
    attendanceFilter,
    channelOrigin,
    conversationFilter,
    includeOfficialWhenAll,
    cursor,
    limit,
    search,
  });

  recordHttpMetric({
    kind: 'GET conversations',
    endpoint: '/api/chat/conversations',
    method: 'GET',
    source: `inboxFetch:${resolveAggregatedSurface(surface)}`,
    durationMs: Math.round(nowMs() - t0),
  });

  return result;
}

/** Compat — só items (1ª página / limit default). */
export async function fetchInboxConversations(
  params: LoadInboxFetchParams,
): Promise<ChatConversation[]> {
  const result = await fetchInboxConversationsPage(params);
  return result.items;
}
