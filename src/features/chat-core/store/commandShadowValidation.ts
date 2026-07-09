/**
 * F5.5 — shadow validation de parity pós-command (DEV).
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';
import type { ChatDomainConversation, ChatDomainMessage } from '../domain/types';
import type { ChatDomainState } from './types';

export type CommandParityResult = {
  parity: boolean;
  idMatch: boolean;
  statusMatch: boolean;
  unreadMatch: boolean;
  assignedMatch: boolean;
  archivedMatch: boolean;
  closedMatch: boolean;
  pinnedMatch: boolean;
  messageStateMatch: boolean;
  optimisticMatch: boolean;
};

function readPinned(conv: ChatDomainConversation): boolean {
  if (conv.raw && typeof conv.raw === 'object') {
    const raw = conv.raw as Record<string, unknown>;
    if (typeof raw.pinned === 'boolean') return raw.pinned;
    const meta = raw.metadata;
    if (meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).pinned === 'boolean') {
      return Boolean((meta as Record<string, unknown>).pinned);
    }
  }
  return false;
}

function readArchived(conv: ChatDomainConversation): boolean {
  const status = (conv.attendanceStatus ?? '').toLowerCase();
  return status === 'archived';
}

function readClosed(conv: ChatDomainConversation): boolean {
  const status = (conv.attendanceStatus ?? '').toLowerCase();
  return status === 'closed';
}

export function compareCommandParity(params: {
  storeState: ChatDomainState;
  legacyConversation?: ChatDomainConversation | null;
  legacyMessages?: readonly ChatDomainMessage[];
  conversationId: string;
}): CommandParityResult {
  const { storeState, legacyConversation, legacyMessages, conversationId } = params;
  const storeConv = storeState.conversations.byId[conversationId] ?? null;
  const pending = Object.values(storeState.commands.pendingCommands);
  const optimistic = Object.keys(storeState.commands.optimisticChanges).length;

  const idMatch = !legacyConversation || storeConv?.id === legacyConversation.id;
  const statusMatch =
    !legacyConversation ||
    (storeConv?.attendanceStatus ?? null) === (legacyConversation.attendanceStatus ?? null);
  const unreadMatch =
    !legacyConversation || (storeConv?.unreadCount ?? 0) === (legacyConversation.unreadCount ?? 0);
  const assignedMatch =
    !legacyConversation ||
    (storeConv?.assignedToUserId ?? null) === (legacyConversation.assignedToUserId ?? null);
  const archivedMatch = !legacyConversation || readArchived(storeConv!) === readArchived(legacyConversation);
  const closedMatch = !legacyConversation || readClosed(storeConv!) === readClosed(legacyConversation);
  const pinnedMatch = !legacyConversation || readPinned(storeConv!) === readPinned(legacyConversation);

  let messageStateMatch = true;
  if (legacyMessages?.length) {
    const storeIds = storeState.messages.byConversationId[conversationId] ?? [];
    const storeMessages = storeIds.map((id) => storeState.messages.byId[id]).filter(Boolean);
    messageStateMatch =
      storeMessages.length >= legacyMessages.length &&
      legacyMessages.every((lm) => {
        const sm = storeMessages.find((m) => m.id === lm.id || m.clientMessageId === lm.clientMessageId);
        return sm ? (sm.status ?? null) === (lm.status ?? null) : false;
      });
  }

  const optimisticMatch = pending.length === 0 && optimistic === 0;

  const parity =
    idMatch &&
    statusMatch &&
    unreadMatch &&
    assignedMatch &&
    archivedMatch &&
    closedMatch &&
    pinnedMatch &&
    messageStateMatch &&
    optimisticMatch;

  if (isChatMigrationFlagEnabled('CHAT_CORE_METRICS') && !parity) {
    console.warn('[chat-core] compareCommandParity mismatch', {
      conversationId,
      idMatch,
      statusMatch,
      unreadMatch,
      assignedMatch,
      archivedMatch,
      closedMatch,
      pinnedMatch,
      messageStateMatch,
      optimisticMatch,
    });
  }

  return {
    parity,
    idMatch,
    statusMatch,
    unreadMatch,
    assignedMatch,
    archivedMatch,
    closedMatch,
    pinnedMatch,
    messageStateMatch,
    optimisticMatch,
  };
}
