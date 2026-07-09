/**
 * F5.5 — restauração de snapshot em rollback de commands.
 */

import type { ChatConversationId } from '../domain/types';
import type { CommandRollbackSnapshot } from './commandState';
import type { ChatDomainState } from './types';

function bumpMessageVersion(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): Record<ChatConversationId, number> {
  return {
    ...state.messages.versionByConversationId,
    [conversationId]: (state.messages.versionByConversationId[conversationId] ?? 0) + 1,
  };
}

export function applyRollbackSnapshot(
  state: ChatDomainState,
  snapshot: CommandRollbackSnapshot,
): ChatDomainState {
  let next = state;

  if (snapshot.conversationId && snapshot.messagesBackup && snapshot.messageIds) {
    const conversationId = snapshot.conversationId;
    const byId = { ...next.messages.byId };
    const currentIds = next.messages.byConversationId[conversationId] ?? [];
    for (const id of currentIds) {
      if (!snapshot.messageIds.includes(id)) {
        delete byId[id];
      }
    }
    if (snapshot.optimisticMessageId) {
      delete byId[snapshot.optimisticMessageId];
    }
    for (const message of snapshot.messagesBackup) {
      byId[message.id] = message;
    }
    next = {
      ...next,
      messages: {
        ...next.messages,
        byId,
        byConversationId: {
          ...next.messages.byConversationId,
          [conversationId]: [...snapshot.messageIds],
        },
        versionByConversationId: bumpMessageVersion(next, conversationId),
      },
    };
  }

  if (snapshot.conversation && snapshot.conversationId) {
    next = {
      ...next,
      conversations: {
        ...next.conversations,
        byId: {
          ...next.conversations.byId,
          [snapshot.conversationId]: snapshot.conversation,
        },
      },
    };
  }

  if (
    snapshot.conversationId &&
    snapshot.conversationUnread !== undefined
  ) {
    const conversationId = snapshot.conversationId;
    const conv = next.conversations.byId[conversationId];
    next = {
      ...next,
      conversations: conv
        ? {
            ...next.conversations,
            byId: {
              ...next.conversations.byId,
              [conversationId]: { ...conv, unreadCount: snapshot.conversationUnread },
            },
          }
        : next.conversations,
      unread: {
        ...next.unread,
        global:
          snapshot.globalUnread !== undefined ? snapshot.globalUnread : next.unread.global,
        byConversationId: {
          ...next.unread.byConversationId,
          [conversationId]: snapshot.conversationUnread,
        },
      },
    };
  }

  if (snapshot.removedConversation) {
    const conversation = snapshot.removedConversation;
    const orderedIds = snapshot.wasInOrderedIds
      ? [conversation.id, ...next.conversations.orderedIds.filter((id) => id !== conversation.id)]
      : next.conversations.orderedIds.includes(conversation.id)
        ? next.conversations.orderedIds
        : [conversation.id, ...next.conversations.orderedIds];
    next = {
      ...next,
      conversations: {
        ...next.conversations,
        byId: { ...next.conversations.byId, [conversation.id]: conversation },
        orderedIds,
      },
    };
  }

  return next;
}
