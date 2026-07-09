/**
 * F5.0 — reducer estrutural e action creators do Domain Store.
 * Sem lógica de negócio; apenas mutações de estado tipadas.
 */

import type {
  ChatDomainConversation,
  ChatDomainInstance,
  ChatDomainMessage,
  ChatConversationId,
  ChatInstanceId,
  ChatMessageId,
} from '../domain/types';
import type { ChatDomainAction, ChatDomainState, UnreadState } from './types';
import { createInitialChatDomainState } from './state';
import { applyRollbackSnapshot } from './rollback';

function bumpMessageVersion(
  state: ChatDomainState,
  conversationId: ChatConversationId,
): Record<ChatConversationId, number> {
  return {
    ...state.messages.versionByConversationId,
    [conversationId]: (state.messages.versionByConversationId[conversationId] ?? 0) + 1,
  };
}

export function reduceChatDomainState(
  state: ChatDomainState,
  action: ChatDomainAction,
): ChatDomainState {
  switch (action.type) {
    case 'conversations/set': {
      const byId = { ...state.conversations.byId };
      const orderedIds: ChatConversationId[] = [];
      for (const conversation of action.conversations) {
        byId[conversation.id] = conversation;
        orderedIds.push(conversation.id);
      }
      return {
        ...state,
        conversations: {
          ...state.conversations,
          byId,
          orderedIds,
        },
      };
    }

    case 'conversations/upsert': {
      const { conversation } = action;
      const orderedIds = state.conversations.orderedIds.includes(conversation.id)
        ? state.conversations.orderedIds
        : [conversation.id, ...state.conversations.orderedIds];
      return {
        ...state,
        conversations: {
          ...state.conversations,
          byId: { ...state.conversations.byId, [conversation.id]: conversation },
          orderedIds,
        },
      };
    }

    case 'conversations/remove': {
      if (!state.conversations.byId[action.conversationId]) return state;
      const nextById = { ...state.conversations.byId };
      delete nextById[action.conversationId];
      return {
        ...state,
        conversations: {
          ...state.conversations,
          byId: nextById,
          orderedIds: state.conversations.orderedIds.filter((id) => id !== action.conversationId),
        },
        selection:
          state.selection.selectedConversationId === action.conversationId
            ? { ...state.selection, selectedConversationId: null }
            : state.selection,
      };
    }

    case 'messages/set': {
      const byId = { ...state.messages.byId };
      const messageIds: ChatMessageId[] = [];
      for (const message of action.messages) {
        if (typeof message.id !== 'string' || !message.id) continue;
        byId[message.id] = message;
        messageIds.push(message.id);
      }
      return {
        ...state,
        messages: {
          ...state.messages,
          byId,
          byConversationId: {
            ...state.messages.byConversationId,
            [action.conversationId]: messageIds,
          },
          versionByConversationId: bumpMessageVersion(state, action.conversationId),
        },
      };
    }

    case 'messages/prepend': {
      const { conversationId, messages } = action;
      const byId = { ...state.messages.byId };
      const existingIds = state.messages.byConversationId[conversationId] ?? [];
      const prependIds: ChatMessageId[] = [];
      for (const message of messages) {
        byId[message.id] = message;
        if (!existingIds.includes(message.id) && !prependIds.includes(message.id)) {
          prependIds.push(message.id);
        }
      }
      if (prependIds.length === 0) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          byId,
          byConversationId: {
            ...state.messages.byConversationId,
            [conversationId]: [...prependIds, ...existingIds],
          },
          versionByConversationId: bumpMessageVersion(state, conversationId),
        },
      };
    }

    case 'messages/setCursor': {
      return {
        ...state,
        messages: {
          ...state.messages,
          lastLoadedCursorByConversationId: {
            ...state.messages.lastLoadedCursorByConversationId,
            [action.conversationId]: action.cursor,
          },
        },
      };
    }

    case 'messages/append': {
      const { conversationId, message } = action;
      const existingIds = state.messages.byConversationId[conversationId] ?? [];
      if (existingIds.includes(message.id)) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          byId: { ...state.messages.byId, [message.id]: message },
          byConversationId: {
            ...state.messages.byConversationId,
            [conversationId]: [...existingIds, message.id],
          },
          versionByConversationId: bumpMessageVersion(state, conversationId),
        },
      };
    }

    case 'messages/update': {
      const current = state.messages.byId[action.messageId];
      if (!current) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          byId: {
            ...state.messages.byId,
            [action.messageId]: { ...current, ...action.patch },
          },
          versionByConversationId: bumpMessageVersion(state, action.conversationId),
        },
      };
    }

    case 'messages/remove': {
      const { conversationId, messageId } = action;
      if (!state.messages.byId[messageId]) return state;
      const nextById = { ...state.messages.byId };
      delete nextById[messageId];
      const ids = (state.messages.byConversationId[conversationId] ?? []).filter(
        (id) => id !== messageId,
      );
      return {
        ...state,
        messages: {
          ...state.messages,
          byId: nextById,
          byConversationId: {
            ...state.messages.byConversationId,
            [conversationId]: ids,
          },
          versionByConversationId: bumpMessageVersion(state, conversationId),
        },
      };
    }

    case 'selection/setConversation':
      return {
        ...state,
        selection: {
          ...state.selection,
          selectedConversationId: action.conversationId,
        },
      };

    case 'loading/setConversations':
      return {
        ...state,
        loading: { ...state.loading, conversations: action.loading },
      };

    case 'loading/setMessages':
      return {
        ...state,
        loading: {
          ...state.loading,
          messages: {
            ...state.loading.messages,
            [action.conversationId]: action.loading,
          },
        },
      };

    case 'unread/set':
      return {
        ...state,
        unread: { ...state.unread, ...action.unread },
      };

    case 'connection/set':
      return {
        ...state,
        connection: { ...state.connection, ...action.connection },
      };

    case 'instances/set': {
      const byId = { ...state.instances.byId };
      const orderedIds: ChatInstanceId[] = [];
      const enabledIds: ChatInstanceId[] = [];
      for (const instance of action.instances) {
        byId[instance.id] = instance;
        orderedIds.push(instance.id);
        if (instance.enabledInChat) enabledIds.push(instance.id);
      }
      return {
        ...state,
        instances: { byId, orderedIds, enabledIds },
      };
    }

    case 'ui/patch':
      return {
        ...state,
        ui: { ...state.ui, ...action.ui },
      };

    case 'hydrate/partial':
      return mergePartialState(state, action.state);

    case 'store/reset':
      return createInitialChatDomainState();

    case 'commands/begin': {
      const { token, command, conversationId, snapshot } = action;
      const pending = {
        id: token,
        name: command,
        conversationId,
        startedAt: Date.now(),
      };
      const change = {
        id: token,
        command,
        conversationId,
        createdAt: Date.now(),
      };
      const entry = {
        id: token,
        command,
        snapshot,
        createdAt: Date.now(),
      };
      const sending =
        command === 'sendMessage' && conversationId
          ? { ...state.loading.sending, [conversationId]: true }
          : state.loading.sending;
      return {
        ...state,
        commands: {
          ...state.commands,
          pendingCommands: { ...state.commands.pendingCommands, [token]: pending },
          optimisticChanges: { ...state.commands.optimisticChanges, [token]: change },
          rollbackStack: [...state.commands.rollbackStack, entry],
          commandVersion: state.commands.commandVersion + 1,
        },
        loading: sending !== state.loading.sending ? { ...state.loading, sending } : state.loading,
      };
    }

    case 'commands/confirm': {
      const { token } = action;
      const pending = state.commands.pendingCommands[token];
      const nextPending = { ...state.commands.pendingCommands };
      delete nextPending[token];
      const nextOptimistic = { ...state.commands.optimisticChanges };
      delete nextOptimistic[token];
      const nextStack = state.commands.rollbackStack.filter((e) => e.id !== token);
      const conversationId = pending?.conversationId;
      const sending =
        conversationId && state.loading.sending[conversationId]
          ? { ...state.loading.sending, [conversationId]: false }
          : state.loading.sending;
      return {
        ...state,
        commands: {
          ...state.commands,
          pendingCommands: nextPending,
          optimisticChanges: nextOptimistic,
          rollbackStack: nextStack,
          lastConfirmedVersion: state.commands.commandVersion,
        },
        loading: sending !== state.loading.sending ? { ...state.loading, sending } : state.loading,
      };
    }

    case 'commands/rollback': {
      const { token } = action;
      const entry = state.commands.rollbackStack.find((e) => e.id === token);
      const pending = state.commands.pendingCommands[token];
      const nextPending = { ...state.commands.pendingCommands };
      delete nextPending[token];
      const nextOptimistic = { ...state.commands.optimisticChanges };
      delete nextOptimistic[token];
      const nextStack = state.commands.rollbackStack.filter((e) => e.id !== token);
      const conversationId = pending?.conversationId;
      const restored = entry ? applyRollbackSnapshot(state, entry.snapshot) : state;
      const sending =
        conversationId && restored.loading.sending[conversationId]
          ? { ...restored.loading.sending, [conversationId]: false }
          : restored.loading.sending;
      return {
        ...restored,
        commands: {
          ...restored.commands,
          pendingCommands: nextPending,
          optimisticChanges: nextOptimistic,
          rollbackStack: nextStack,
          commandVersion: restored.commands.commandVersion + 1,
        },
        loading: sending !== restored.loading.sending ? { ...restored.loading, sending } : restored.loading,
      };
    }

    default:
      return state;
  }
}

function mergePartialState(
  state: ChatDomainState,
  partial: Partial<ChatDomainState>,
): ChatDomainState {
  return {
    conversations: partial.conversations
      ? { ...state.conversations, ...partial.conversations }
      : state.conversations,
    messages: partial.messages ? { ...state.messages, ...partial.messages } : state.messages,
    selection: partial.selection ? { ...state.selection, ...partial.selection } : state.selection,
    compose: partial.compose ? { ...state.compose, ...partial.compose } : state.compose,
    loading: partial.loading ? { ...state.loading, ...partial.loading } : state.loading,
    unread: partial.unread ? { ...state.unread, ...partial.unread } : state.unread,
    connection: partial.connection
      ? { ...state.connection, ...partial.connection }
      : state.connection,
    instances: partial.instances ? { ...state.instances, ...partial.instances } : state.instances,
    ui: partial.ui ? { ...state.ui, ...partial.ui } : state.ui,
    commands: partial.commands ? { ...state.commands, ...partial.commands } : state.commands,
  };
}

/** Action creators tipados (contratos — não expostos à UI nesta sprint). */
export const chatDomainActionCreators = {
  setConversations(conversations: ChatDomainConversation[]) {
    return { type: 'conversations/set' as const, conversations };
  },
  setMessages(conversationId: ChatConversationId, messages: ChatDomainMessage[]) {
    return { type: 'messages/set' as const, conversationId, messages };
  },
  appendMessage(conversationId: ChatConversationId, message: ChatDomainMessage) {
    return { type: 'messages/append' as const, conversationId, message };
  },
  updateMessage(
    conversationId: ChatConversationId,
    messageId: ChatMessageId,
    patch: Partial<ChatDomainMessage>,
  ) {
    return { type: 'messages/update' as const, conversationId, messageId, patch };
  },
  removeMessage(conversationId: ChatConversationId, messageId: ChatMessageId) {
    return { type: 'messages/remove' as const, conversationId, messageId };
  },
  prependMessages(conversationId: ChatConversationId, messages: ChatDomainMessage[]) {
    return { type: 'messages/prepend' as const, conversationId, messages };
  },
  setMessageCursor(conversationId: ChatConversationId, cursor: string | null) {
    return { type: 'messages/setCursor' as const, conversationId, cursor };
  },
  setLoadingMessages(conversationId: ChatConversationId, loading: boolean) {
    return { type: 'loading/setMessages' as const, conversationId, loading };
  },
  setSelectedConversation(conversationId: ChatConversationId | null) {
    return { type: 'selection/setConversation' as const, conversationId };
  },
  setLoadingConversations(loading: boolean) {
    return { type: 'loading/setConversations' as const, loading };
  },
  setUnread(unread: Partial<UnreadState>) {
    return { type: 'unread/set' as const, unread };
  },
  hydrate(state: Partial<ChatDomainState>) {
    return { type: 'hydrate/partial' as const, state };
  },
  reset() {
    return { type: 'store/reset' as const };
  },
};
