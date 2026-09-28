/**
 * F5.5 — estado interno de commands (optimistic / confirm / rollback).
 */

import type { ChatConversationId } from '../domain/types';

export type ChatCommandName =
  | 'sendMessage'
  | 'markMessageRead'
  | 'markConversationRead'
  | 'assignConversation'
  | 'transferConversation'
  | 'archiveConversation'
  | 'closeConversation'
  | 'reopenConversation'
  | 'deleteConversation'
  | 'pinConversation'
  | 'unpinConversation'
  | 'updateConversationStatus';

export type PendingCommand = {
  id: string;
  name: ChatCommandName;
  conversationId?: ChatConversationId;
  startedAt: number;
};

export type OptimisticChange = {
  id: string;
  command: ChatCommandName;
  conversationId?: ChatConversationId;
  createdAt: number;
};

export type CommandRollbackSnapshot = {
  conversationId?: ChatConversationId;
  messageIds?: string[];
  messagesBackup?: import('../domain/types').ChatDomainMessage[];
  optimisticMessageId?: string;
  conversation?: import('../domain/types').ChatDomainConversation | null;
  conversationUnread?: number;
  globalUnread?: number;
  removedConversation?: import('../domain/types').ChatDomainConversation;
  wasInOrderedIds?: boolean;
};

export type RollbackEntry = {
  id: string;
  command: ChatCommandName;
  snapshot: CommandRollbackSnapshot;
  createdAt: number;
};

export type CommandSliceState = {
  pendingCommands: Record<string, PendingCommand>;
  commandVersion: number;
  optimisticChanges: Record<string, OptimisticChange>;
  rollbackStack: RollbackEntry[];
  lastConfirmedVersion: number;
};

export function createInitialCommandState(): CommandSliceState {
  return {
    pendingCommands: {},
    commandVersion: 0,
    optimisticChanges: {},
    rollbackStack: [],
    lastConfirmedVersion: 0,
  };
}
