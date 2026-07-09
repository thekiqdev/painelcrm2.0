/**
 * Merge seguro de patches realtime em conversas (espelha Chat.tsx).
 */

import type { ChatConversation } from '@/services/chat';

export function mergeChatConversationRealtimePatch(
  prev: ChatConversation,
  incoming: ChatConversation,
): ChatConversation {
  return {
    ...prev,
    ...incoming,
    instance_id: incoming.instance_id ?? prev.instance_id ?? null,
    whatsapp_official_account_id:
      incoming.whatsapp_official_account_id ?? prev.whatsapp_official_account_id ?? null,
    client_id: incoming.client_id ?? prev.client_id ?? null,
    leadId: incoming.leadId ?? prev.leadId ?? null,
    external_chat_id: incoming.external_chat_id || prev.external_chat_id,
    phoneNumber: incoming.phoneNumber ?? prev.phoneNumber,
    canonicalPhone: incoming.canonicalPhone ?? prev.canonicalPhone,
    canonical_phone: incoming.canonical_phone ?? prev.canonical_phone,
    conversation_type: incoming.conversation_type ?? prev.conversation_type,
    provider: incoming.provider || prev.provider,
    contactName: incoming.contactName ?? prev.contactName ?? null,
    profileName: incoming.profileName ?? prev.profileName ?? null,
    displayName: incoming.displayName ?? prev.displayName ?? null,
    display_name: incoming.display_name ?? prev.display_name ?? null,
    avatarUrl: incoming.avatarUrl ?? prev.avatarUrl ?? null,
    avatar_url: incoming.avatar_url ?? prev.avatar_url ?? null,
    final_avatar_url: incoming.final_avatar_url ?? prev.final_avatar_url ?? null,
    avatar_cached_url: incoming.avatar_cached_url ?? prev.avatar_cached_url ?? null,
    tags: incoming.tags !== undefined ? incoming.tags : prev.tags,
    metadata: incoming.metadata !== undefined ? incoming.metadata : prev.metadata,
    attendance_status: incoming.attendance_status ?? prev.attendance_status ?? null,
    assigned_to_user_id: incoming.assigned_to_user_id ?? prev.assigned_to_user_id ?? null,
    assigned_team_id: incoming.assigned_team_id ?? prev.assigned_team_id ?? null,
    assigned_team_name: incoming.assigned_team_name ?? prev.assigned_team_name ?? null,
    queue_id: incoming.queue_id ?? prev.queue_id ?? null,
    assigned_at: incoming.assigned_at ?? prev.assigned_at ?? null,
    closed_at: incoming.closed_at ?? prev.closed_at ?? null,
    last_assignment_reason:
      incoming.last_assignment_reason ?? prev.last_assignment_reason ?? null,
    assignee_email: incoming.assignee_email ?? prev.assignee_email ?? null,
    assignee_display: incoming.assignee_display ?? prev.assignee_display ?? null,
    assignee_avatar_url:
      incoming.assignee_avatar_url !== undefined
        ? incoming.assignee_avatar_url ?? null
        : prev.assignee_avatar_url,
  };
}

export function sortConversationsByRecent(list: ChatConversation[]): ChatConversation[] {
  return [...list].sort((a, b) => {
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    if (ta && tb) return tb - ta;
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
    const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return cb - ca;
  });
}
