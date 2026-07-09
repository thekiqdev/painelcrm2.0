/**
 * F5.1 — mapeamento legacy API → tipos de domínio do Store.
 */

import type { ChatConversation, ChatInstance, ChatMessage } from '@/services/chat';
import { adaptLegacyChatMessage, adaptLegacyConversation } from '../domain/adapters';
import type {
  ChatDomainConversation,
  ChatDomainInstance,
  ChatDomainMessage,
  ChatChannelKind,
} from '../domain/types';

function toChannelKind(raw: unknown): ChatChannelKind {
  if (typeof raw === 'string' && raw.trim()) return raw;
  return 'uazapi';
}

export function mapLegacyConversationToDomain(raw: ChatConversation): ChatDomainConversation {
  const normalized = adaptLegacyConversation(raw);
  return {
    id: normalized.id,
    instanceId: normalized.instance_id ?? null,
    channel: toChannelKind(normalized.provider),
    unreadCount: normalized.unreadCount ?? 0,
    lastMessageAt: normalized.lastMessageAt ?? null,
    lastMessagePreview: normalized.lastMessagePreview ?? null,
    contactName:
      normalized.contactName ??
      normalized.displayName ??
      normalized.display_name ??
      normalized.profileName ??
      null,
    phoneNumber: normalized.phoneNumber ?? normalized.canonicalPhone ?? null,
    attendanceStatus: normalized.attendance_status ?? null,
    assignedToUserId: normalized.assigned_to_user_id ?? null,
    clientId: normalized.client_id ?? null,
    leadId: normalized.leadId ?? null,
    conversationType: normalized.conversation_type ?? null,
    raw: normalized,
  };
}

export function mapLegacyMessageToDomain(raw: ChatMessage): ChatDomainMessage {
  const normalized = adaptLegacyChatMessage(raw);
  const direction =
    normalized.direction === 'outgoing' || normalized.direction === 'incoming'
      ? normalized.direction
      : 'incoming';
  return {
    id: normalized.id ?? normalized.client_message_id ?? `temp-${crypto.randomUUID()}`,
    conversationId: normalized.conversation_id,
    direction,
    body: normalized.body ?? normalized.content ?? null,
    status: normalized.status ?? null,
    sentAt: normalized.sent_at ?? normalized.created_at ?? null,
    externalMessageId: normalized.external_message_id ?? null,
    clientMessageId: normalized.client_message_id ?? null,
    raw: normalized,
  };
}

export function mapLegacyInstanceToDomain(raw: ChatInstance): ChatDomainInstance {
  return {
    id: raw.id,
    status: raw.status ?? null,
    enabledInChat: Boolean(raw.enabled_in_chat ?? raw.enabledInChat),
    channel: 'uazapi',
    raw,
  };
}
