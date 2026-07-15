/**
 * F5.2 — Domain Store → ChatConversation (UI legado).
 */

import type { ChatConversation } from '@/services/chat';
import type { ChatDomainConversation } from '../domain/types';
import { recordConversationDivergenceIfAny } from '../metrics/conversationRuntimeMetrics';

export function domainConversationToUi(conversation: ChatDomainConversation): ChatConversation {
  const waArchived =
    typeof conversation.waArchived === 'boolean'
      ? conversation.waArchived
      : Boolean((conversation.raw as ChatConversation | undefined)?.wa_archived);

  if (conversation.raw && typeof conversation.raw === 'object') {
    const raw = conversation.raw as ChatConversation;
    if (typeof raw.id === 'string') {
      const client_id = conversation.clientId ?? raw.client_id ?? null;
      const leadId = conversation.leadId ?? raw.leadId ?? null;
      const lastMessagePreview =
        conversation.lastMessagePreview ?? raw.lastMessagePreview ?? null;
      recordConversationDivergenceIfAny({
        conversationId: conversation.id,
        pipeline: 'domainToUi',
        origin: 'store.raw_vs_domain',
        storeLeadId: conversation.leadId,
        uiLeadId: raw.leadId,
        storeClientId: conversation.clientId,
        uiClientId: raw.client_id,
        storePreview: conversation.lastMessagePreview,
        uiPreview: raw.lastMessagePreview,
      });
      return {
        ...raw,
        id: conversation.id,
        unreadCount: conversation.unreadCount ?? raw.unreadCount ?? 0,
        lastMessageAt: conversation.lastMessageAt ?? raw.lastMessageAt ?? null,
        lastMessagePreview,
        client_id,
        leadId,
        wa_archived: waArchived,
      };
    }
  }

  return {
    id: conversation.id,
    user_id: '',
    external_chat_id: conversation.phoneNumber ?? '',
    instance_id: conversation.instanceId,
    contactName: conversation.contactName,
    phoneNumber: conversation.phoneNumber,
    lastMessagePreview: conversation.lastMessagePreview,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCount,
    client_id: conversation.clientId,
    leadId: conversation.leadId,
    attendance_status: conversation.attendanceStatus as ChatConversation['attendance_status'],
    wa_archived: waArchived,
    assigned_to_user_id: conversation.assignedToUserId,
    conversation_type: conversation.conversationType as ChatConversation['conversation_type'],
  };
}
