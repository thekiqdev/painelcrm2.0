/**
 * F2.2 — patch conversation.updated
 */

import type { QueryClient } from '@tanstack/react-query';
import { normalizeConversation, type ChatConversation } from '@/services/chat';
import type { ChatWsPatchContext, ChatWsPatchResult } from '../types';
import {
  conversationExistsInFloatingCaches,
  patchAllFloatingConversationLists,
  patchFloatingChatConversationMeta,
  patchFloatingChatMinimizedMeta,
} from '../query-cache';
import {
  conversationUpdatedRawToLegacyShape,
  isConversationUpdatedPayloadSufficient,
} from '../payload-sufficiency';

export function applyConversationUpdatedPatch(
  queryClient: QueryClient,
  raw: unknown,
  ctx: ChatWsPatchContext = {},
): ChatWsPatchResult {
  if (!isConversationUpdatedPayloadSufficient(raw)) {
    return { applied: false, eventKind: 'conversation.updated', reason: 'payload_insufficient' };
  }

  const shape = conversationUpdatedRawToLegacyShape(raw);
  if (!shape) {
    return { applied: false, eventKind: 'conversation.updated', reason: 'payload_shape' };
  }

  const incoming = normalizeConversation(shape);
  const conversationId = incoming.id;
  if (!conversationId) {
    return { applied: false, eventKind: 'conversation.updated', reason: 'missing_id' };
  }

  const scopes: string[] = [];
  const inCache = conversationExistsInFloatingCaches(queryClient, conversationId);

  const listsPatched = patchAllFloatingConversationLists(queryClient, conversationId, (prev) => {
    if (!prev) {
      if (!inCache) return null;
      return incoming;
    }
    return incoming;
  });

  if (listsPatched) scopes.push('lists');
  else if (!inCache) {
    return { applied: false, eventKind: 'conversation.updated', reason: 'conversation_not_in_cache' };
  }

  if (patchFloatingChatConversationMeta(queryClient, conversationId, incoming)) {
    scopes.push('meta');
  }
  if (ctx.isMinimizedConversation) {
    if (patchFloatingChatMinimizedMeta(queryClient, conversationId, incoming)) {
      scopes.push('minimized-meta');
    }
  }

  return {
    applied: listsPatched || scopes.length > 0,
    eventKind: 'conversation.updated',
    scopes,
  };
}
