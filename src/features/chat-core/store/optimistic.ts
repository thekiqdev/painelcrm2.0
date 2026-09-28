/**
 * F5.5 — optimistic updates para commands de escrita.
 */

import type {
  ChatConversationId,
  ChatDomainConversation,
  ChatDomainMessage,
  ChatMessageId,
} from '../domain/types';
import type { ChatCommandName, CommandRollbackSnapshot } from './commandState';
import { chatDomainActionCreators } from './actions';
import { getChatDomainStoreSession } from './session';
import { createCommandToken, enqueueCommand } from './commandQueue';
import { recordCommandOptimisticCount } from './commandMetrics';

function requireStore() {
  const store = getChatDomainStoreSession();
  if (!store) throw new Error('[chat-core] Domain Store session not initialized');
  return store;
}

function beginOptimistic(
  command: ChatCommandName,
  conversationId: ChatConversationId | undefined,
  snapshot: CommandRollbackSnapshot,
  apply: () => void,
): string {
  const store = requireStore();
  const token = createCommandToken();
  apply();
  store.dispatch({ type: 'commands/begin', token, command, conversationId, snapshot });
  enqueueCommand({ token, command, conversationId, enqueuedAt: Date.now() });
  recordCommandOptimisticCount();
  return token;
}

export function applyOptimisticSendMessagePreApplied(
  conversationId: ChatConversationId,
  optimisticMessageId: ChatMessageId,
): string {
  const store = requireStore();
  const state = store.getState();
  const messageIds = state.messages.byConversationId[conversationId] ?? [];
  const messagesBackup = messageIds
    .map((id) => state.messages.byId[id])
    .filter((m): m is ChatDomainMessage => Boolean(m));
  const snapshot: CommandRollbackSnapshot = {
    conversationId,
    messageIds: [...messageIds],
    messagesBackup,
    optimisticMessageId,
  };
  return beginOptimistic('sendMessage', conversationId, snapshot, () => {
    const existing = state.messages.byId[optimisticMessageId];
    if (existing) {
      store.dispatch(
        chatDomainActionCreators.updateMessage(conversationId, optimisticMessageId, {
          status: 'sending',
        }),
      );
    }
  });
}

export function applyOptimisticSendMessage(
  conversationId: ChatConversationId,
  optimisticMessage: ChatDomainMessage,
): string {
  const store = requireStore();
  const state = store.getState();
  const messageIds = state.messages.byConversationId[conversationId] ?? [];
  const messagesBackup = messageIds
    .map((id) => state.messages.byId[id])
    .filter((m): m is ChatDomainMessage => Boolean(m));
  const snapshot: CommandRollbackSnapshot = {
    conversationId,
    messageIds: [...messageIds],
    messagesBackup,
    optimisticMessageId: optimisticMessage.id,
  };
  return beginOptimistic('sendMessage', conversationId, snapshot, () => {
    store.dispatch(chatDomainActionCreators.appendMessage(conversationId, optimisticMessage));
  });
}

export function applyOptimisticMarkConversationRead(conversationId: ChatConversationId): string {
  const store = requireStore();
  const state = store.getState();
  const conv = state.conversations.byId[conversationId];
  const conversationUnread =
    state.unread.byConversationId[conversationId] ?? conv?.unreadCount ?? 0;
  const snapshot: CommandRollbackSnapshot = {
    conversationId,
    conversation: conv ? { ...conv } : null,
    conversationUnread,
    globalUnread: state.unread.global,
  };
  return beginOptimistic('markConversationRead', conversationId, snapshot, () => {
    if (conv) {
      store.dispatch({
        type: 'conversations/upsert',
        conversation: { ...conv, unreadCount: 0 },
      });
    }
    store.dispatch(
      chatDomainActionCreators.setUnread({
        byConversationId: { ...state.unread.byConversationId, [conversationId]: 0 },
        global: Math.max(0, state.unread.global - conversationUnread),
      }),
    );
  });
}

export function applyOptimisticMarkMessageRead(
  conversationId: ChatConversationId,
  messageId: ChatMessageId,
): string {
  const store = requireStore();
  const state = store.getState();
  const message = state.messages.byId[messageId];
  const snapshot: CommandRollbackSnapshot = {
    conversationId,
    messagesBackup: message ? [{ ...message }] : [],
    messageIds: state.messages.byConversationId[conversationId] ?? [],
  };
  return beginOptimistic('markMessageRead', conversationId, snapshot, () => {
    if (message) {
      store.dispatch(
        chatDomainActionCreators.updateMessage(conversationId, messageId, { status: 'read' }),
      );
    }
  });
}

export function applyOptimisticConversationPatch(
  command: ChatCommandName,
  conversationId: ChatConversationId,
  patch: Partial<ChatDomainConversation> & { raw?: unknown },
): string {
  const store = requireStore();
  const state = store.getState();
  const conv = state.conversations.byId[conversationId];
  const snapshot: CommandRollbackSnapshot = {
    conversationId,
    conversation: conv ? { ...conv } : null,
  };
  return beginOptimistic(command, conversationId, snapshot, () => {
    if (!conv) return;
    store.dispatch({
      type: 'conversations/upsert',
      conversation: {
        ...conv,
        ...patch,
        raw: patch.raw !== undefined ? patch.raw : conv.raw,
      },
    });
  });
}

export function applyOptimisticRemoveConversation(conversationId: ChatConversationId): string {
  const store = requireStore();
  const state = store.getState();
  const conv = state.conversations.byId[conversationId];
  const snapshot: CommandRollbackSnapshot = {
    conversationId,
    removedConversation: conv ? { ...conv } : undefined,
    wasInOrderedIds: state.conversations.orderedIds.includes(conversationId),
  };
  return beginOptimistic('deleteConversation', conversationId, snapshot, () => {
    store.dispatch({ type: 'conversations/remove', conversationId });
  });
}

export function applyOptimisticPin(
  conversationId: ChatConversationId,
  pinned: boolean,
): string {
  const store = requireStore();
  const state = store.getState();
  const conv = state.conversations.byId[conversationId];
  const raw =
    conv?.raw && typeof conv.raw === 'object'
      ? { ...(conv.raw as Record<string, unknown>), pinned }
      : { pinned };
  return applyOptimisticConversationPatch(
    pinned ? 'pinConversation' : 'unpinConversation',
    conversationId,
    { raw },
  );
}
