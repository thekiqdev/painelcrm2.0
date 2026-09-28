/**
 * F2.4 — patch conversation.deleted
 */

import type { QueryClient } from '@tanstack/react-query';
import type { ChatWsPatchResult } from '../types';
import { isConversationDeletedPayloadSufficient } from '../payload-sufficiency';
import { pickConversationId, removeConversationFromFloatingCaches } from '../query-cache';

export function applyConversationDeletedPatch(
  queryClient: QueryClient,
  raw: unknown,
): ChatWsPatchResult {
  if (!isConversationDeletedPayloadSufficient(raw)) {
    return { applied: false, eventKind: 'conversation.deleted', reason: 'payload_insufficient' };
  }

  const conversationId = pickConversationId(raw);
  if (!conversationId) {
    return { applied: false, eventKind: 'conversation.deleted', reason: 'missing_id' };
  }

  const patched = removeConversationFromFloatingCaches(queryClient, conversationId);
  return {
    applied: patched,
    eventKind: 'conversation.deleted',
    scopes: patched ? ['lists', 'meta', 'messages'] : undefined,
    reason: patched ? undefined : 'conversation_not_in_cache',
  };
}
