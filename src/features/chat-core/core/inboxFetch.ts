/**
 * F5.9 — fetch unificado de inbox (Repository only, sem escrita no Store).
 */

import { listChatConversations } from '@/repositories/chatConversationsRepository';
import type { ChatAggregatedSurface } from '@/lib/chatAggregatedFlags';
import type { FetchMergedConversationsParams } from '@/lib/chatConversationsFetch';
import type { ChatConversation } from '@/services/chat';
import type { ChatInboxScope, ChatInstanceId } from '../domain/types';

export type LoadInboxSurface = ChatAggregatedSurface | 'core' | 'bootstrap';

export type LoadInboxFetchParams = FetchMergedConversationsParams & {
  surface?: LoadInboxSurface;
};

function resolveAggregatedSurface(surface: LoadInboxSurface | undefined): ChatAggregatedSurface {
  if (!surface || surface === 'core' || surface === 'bootstrap') {
    return 'chat';
  }
  return surface;
}

/** Busca lista de conversas via Repository (agregado ou legado por superfície). */
export async function fetchInboxConversations(
  params: LoadInboxFetchParams,
): Promise<ChatConversation[]> {
  const {
    instanceIds,
    inboxScope,
    quickFilter = 'all',
    attendanceFilter,
    channelOrigin = 'all',
    conversationFilter,
    includeOfficialWhenAll = channelOrigin === 'all',
    surface,
  } = params;

  const result = await listChatConversations({
    surface: resolveAggregatedSurface(surface),
    instanceIds: instanceIds as ChatInstanceId[],
    inboxScope: inboxScope as ChatInboxScope,
    quickFilter,
    attendanceFilter,
    channelOrigin,
    conversationFilter,
    includeOfficialWhenAll,
  });

  return result.items;
}
