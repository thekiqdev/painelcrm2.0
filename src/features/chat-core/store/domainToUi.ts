/**
 * F5.2 — Domain Store → ChatConversation (UI legado).
 */

import type { ChatConversation } from '@/services/chat';
import type { ChatDomainConversation } from '../domain/types';
import { recordConversationDivergenceIfAny } from '../metrics/conversationRuntimeMetrics';

function nonEmptyStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function domainConversationToUi(conversation: ChatDomainConversation): ChatConversation {
  const waArchived =
    typeof conversation.waArchived === 'boolean'
      ? conversation.waArchived
      : Boolean((conversation.raw as ChatConversation | undefined)?.wa_archived);

  if (conversation.raw && typeof conversation.raw === 'object') {
    const raw = conversation.raw as ChatConversation & Record<string, unknown>;
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
      // Preferir strings não-vazias do raw; se patch parcial zerou, cair no domínio.
      const contactName =
        nonEmptyStr(raw.contactName) ??
        nonEmptyStr(raw.contact_name) ??
        conversation.contactName ??
        null;
      const displayName =
        nonEmptyStr(raw.displayName) ??
        nonEmptyStr(raw.display_name) ??
        contactName;
      const phoneNumber =
        nonEmptyStr(raw.phoneNumber) ??
        nonEmptyStr(raw.phone_number) ??
        conversation.phoneNumber ??
        null;
      return {
        ...raw,
        id: conversation.id,
        unreadCount: conversation.unreadCount ?? raw.unreadCount ?? 0,
        lastMessageAt: conversation.lastMessageAt ?? raw.lastMessageAt ?? null,
        lastMessagePreview,
        contactName,
        displayName,
        display_name: displayName,
        profileName: nonEmptyStr(raw.profileName) ?? nonEmptyStr(raw.profile_name) ?? null,
        phoneNumber,
        client_id,
        leadId,
        wa_archived: waArchived,
        attendance_status:
          (conversation.attendanceStatus as ChatConversation['attendance_status']) ??
          raw.attendance_status ??
          null,
        assigned_to_user_id: conversation.assignedToUserId ?? raw.assigned_to_user_id ?? null,
        assignee_email: nonEmptyStr(raw.assignee_email),
        assignee_display: nonEmptyStr(raw.assignee_display),
        assignee_avatar_url: nonEmptyStr(raw.assignee_avatar_url),
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
