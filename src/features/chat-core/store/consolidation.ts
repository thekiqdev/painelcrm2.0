/**
 * F5.6 — API de escrita UI → Domain Store (única Source of Truth).
 *
 * A UI não deve chamar syncStoreFrom* diretamente.
 */

import type { ChatConversation, ChatMessage } from '@/services/chat';
import type { ChatDomainMessage } from '../domain/types';
import { chatDomainActionCreators } from './actions';
import { mapLegacyConversationToDomain, mapLegacyMessageToDomain } from './domainMappers';
import { shouldUseChatDomainStore } from './flags';
import { getChatDomainStoreSession } from './session';
import { recordStoreUpdate } from './consolidatedMetrics';
import { auditLogApplyStoreConversationList } from './f5HydrationAudit';
import { selectConversationsForUi } from './conversationSelectors';

export function isChatStoreSourceOfTruth(): boolean {
  return shouldUseChatDomainStore();
}

export function ensureChatDomainStoreSession() {
  return getChatDomainStoreSession();
}

export function readStoreConversationCount(): number {
  return getChatDomainStoreSession()?.getState().conversations.orderedIds.length ?? 0;
}

/**
 * F5.9 — escrita interna de inbox; apenas `loadInboxCommand` / `clearInboxCommand`.
 * Não exportar para UI via `store/public.ts`.
 */
export function applyStoreConversationListInternal(
  conversations: readonly ChatConversation[],
): void {
  if (!shouldUseChatDomainStore()) return;
  const store = getChatDomainStoreSession();
  if (!store) return;
  const domain = conversations.map(mapLegacyConversationToDomain);
  auditLogApplyStoreConversationList({
    conversationCount: conversations.length,
    firstId: conversations[0]?.id ?? null,
    lastId: conversations.length > 0 ? conversations[conversations.length - 1]!.id : null,
  });
  store.dispatch(chatDomainActionCreators.setConversations(domain));
  recordStoreUpdate('conversations');
}

/** @deprecated F5.9 — use loadInboxCommand. Mantido para testes legados. */
export function applyStoreConversationList(conversations: readonly ChatConversation[]): void {
  applyStoreConversationListInternal(conversations);
}

/**
 * Upsert após confirmação do servidor (link CRM, archive, patch pontual).
 * Não substitui `loadInboxCommand` para hidratação da lista.
 */
export function applyStoreConversationUpsert(conversation: ChatConversation): boolean {
  if (!shouldUseChatDomainStore()) return false;
  const store = getChatDomainStoreSession();
  if (!store) return false;
  const existing = store.getState().conversations.byId[conversation.id];
  const mapped = mapLegacyConversationToDomain(conversation);
  const merged = existing
    ? {
        ...existing,
        ...mapped,
        raw:
          mapped.raw &&
          existing.raw &&
          typeof existing.raw === 'object' &&
          typeof mapped.raw === 'object'
            ? { ...(existing.raw as Record<string, unknown>), ...(mapped.raw as Record<string, unknown>) }
            : (mapped.raw ?? existing.raw),
      }
    : mapped;
  store.dispatch(chatDomainActionCreators.upsertConversation(merged));
  recordStoreUpdate('conversations');
  return true;
}

export function applyStoreConversationRemove(conversationId: string): boolean {
  if (!shouldUseChatDomainStore()) return false;
  const store = getChatDomainStoreSession();
  if (!store) return false;
  store.dispatch(chatDomainActionCreators.removeConversation(conversationId));
  recordStoreUpdate('conversations');
  return true;
}

/**
 * Ponte para o `setConversations` legado do Chat.tsx quando o store é SoT.
 * Evita no-ops silenciosos em vínculo CRM / archive / badge.
 */
export function applyStoreConversationsUiUpdate(
  action: ChatConversation[] | ((prev: ChatConversation[]) => ChatConversation[]),
): boolean {
  if (!shouldUseChatDomainStore()) return false;
  const store = getChatDomainStoreSession();
  if (!store) return false;
  const prev = selectConversationsForUi(store.getState());
  const next = typeof action === 'function' ? action(prev) : action;
  applyStoreConversationListInternal(next);
  return true;
}

/**
 * F5.10 — escrita interna de mensagens; apenas `loadMessagesCommand` (hidratação).
 * Outbound/optimistic usa `applyStoreMessages` (UI).
 */
export function applyStoreMessagesInternal(
  conversationId: string,
  messages: readonly ChatDomainMessage[],
): void {
  if (!shouldUseChatDomainStore()) return;
  const store = getChatDomainStoreSession();
  if (!store) return;
  store.dispatch(chatDomainActionCreators.setMessages(conversationId, [...messages]));
  recordStoreUpdate('messages');
}

export function applyStoreMessages(
  conversationId: string,
  messages: readonly ChatMessage[],
): void {
  if (!shouldUseChatDomainStore()) return;
  applyStoreMessagesInternal(conversationId, messages.map(mapLegacyMessageToDomain));
}

export function setStoreLoadingConversations(loading: boolean): void {
  if (!shouldUseChatDomainStore()) return;
  const store = getChatDomainStoreSession();
  if (!store) return;
  store.dispatch(chatDomainActionCreators.setLoadingConversations(loading));
}

export function setStoreLoadingMessages(conversationId: string, loading: boolean): void {
  if (!shouldUseChatDomainStore()) return;
  const store = getChatDomainStoreSession();
  if (!store) return;
  store.dispatch(chatDomainActionCreators.setLoadingMessages(conversationId, loading));
}
