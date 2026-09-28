/**
 * TF8 E4 — bubble recent sem GET quando Store / freshness já têm lista.
 */

import type { ChatConversation } from '@/services/chat';
import type { ChatInboxScope } from '@/repositories/chatConversationsRepository';
import { DEFAULT_INBOX_PAGE_SIZE } from '@/repositories/chatConversationsRepository';
import { listBubbleChatConversations } from '@/repositories/chatConversationsRepository';
import { shouldUseChatDomainStore } from '../store/flags';
import { getChatDomainStoreSession } from '../store/session';
import { selectConversationsForUi } from '../store/conversationSelectors';
import {
  getInFlightInboxLoad,
  peekFreshInboxItems,
  type LoadInboxParams,
} from './loadInbox';

const BUBBLE_LIMIT = 4;

function bubbleInboxParams(
  instanceIds: string[],
  inboxScope: ChatInboxScope,
): LoadInboxParams {
  return {
    surface: 'float',
    instanceIds,
    inboxScope,
    quickFilter: 'all',
    limit: DEFAULT_INBOX_PAGE_SIZE,
    mode: 'replace',
  };
}

/** Slice top-N da Domain Store (já ordenada). */
export function peekBubbleRecentFromDomainStore(limit = BUBBLE_LIMIT): ChatConversation[] | null {
  if (!shouldUseChatDomainStore()) return null;
  const session = getChatDomainStoreSession();
  if (!session) return null;
  const rows = selectConversationsForUi(session.getState(), { quickFilter: 'all' });
  if (rows.length === 0) return null;
  return rows.slice(0, limit);
}

/**
 * Preferência: Store → freshness inbox → join in-flight limit=50 → GET limit=4.
 */
export async function resolveBubbleRecentConversations(params: {
  instanceIds: string[];
  inboxScope: ChatInboxScope;
}): Promise<ChatConversation[]> {
  const { instanceIds, inboxScope } = params;
  if (instanceIds.length === 0) return [];

  const fromStore = peekBubbleRecentFromDomainStore(BUBBLE_LIMIT);
  if (fromStore) return fromStore;

  const inboxParams = bubbleInboxParams(instanceIds, inboxScope);
  const fresh = peekFreshInboxItems(inboxParams);
  if (fresh && fresh.length > 0) return fresh.slice(0, BUBBLE_LIMIT);

  const inFlight = getInFlightInboxLoad(inboxParams);
  if (inFlight) {
    try {
      const result = await inFlight;
      if (result.items.length > 0) return result.items.slice(0, BUBBLE_LIMIT);
    } catch {
      /* cai no GET bubble */
    }
  }

  return listBubbleChatConversations({
    surface: 'float',
    instanceIds,
    inboxScope,
  });
}
