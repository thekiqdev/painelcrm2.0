import {
  conversationRowForClientApi,
} from '../../utils/uazapiIdentityResolve.js';
import { refreshCatalogMediaRelativeSignedUrl } from '../../utils/catalogMediaPublicSignedUrl.js';
import { resolveCommunicationDisplayIdentity } from '../communicationContactService.js';

export function mapConversationRowsForClient(
  rows: Record<string, unknown>[],
  view: 'list' | 'full',
): Record<string, unknown>[] {
  const mapped = rows.map((r) => {
    const displayName = resolveCommunicationDisplayIdentity({
      communicationDisplayName:
        typeof r.communication_display_name === 'string' && r.communication_display_name.trim()
          ? r.communication_display_name
          : null,
      providerName:
        typeof r.display_name === 'string' && r.display_name.trim()
          ? r.display_name
          : typeof r.contact_name === 'string' && r.contact_name.trim()
            ? r.contact_name
            : typeof r.profile_name === 'string' && r.profile_name.trim()
              ? r.profile_name
              : null,
      phone:
        typeof r.phone_number === 'string' && r.phone_number.trim()
          ? r.phone_number
          : typeof r.canonical_phone === 'string' && r.canonical_phone.trim()
            ? r.canonical_phone
            : null,
    });

    const full = conversationRowForClientApi({
      ...r,
      display_name: displayName,
      last_message_at:
        r.effective_last_message_at ?? r.last_message_at ?? null,
    });

    if (view === 'full') {
      return {
        ...full,
        assignee_avatar_url: refreshCatalogMediaRelativeSignedUrl(
          typeof full.assignee_avatar_url === 'string' ? full.assignee_avatar_url : null,
        ),
      };
    }

    return toListViewItem(full);
  });

  return mapped;
}

function toListViewItem(full: Record<string, unknown>): Record<string, unknown> {
  const tags = Array.isArray(full.tags) ? full.tags : [];
  /** TF3.3 — avatar de exibição (persistido ou CDN/meta já resolvido em conversationRowForClientApi). */
  const avatarUrl = full.avatar_url ?? null;
  return {
    id: full.id,
    user_id: full.user_id,
    instance_id: full.instance_id ?? null,
    whatsapp_official_account_id: full.whatsapp_official_account_id ?? null,
    provider: full.provider ?? null,
    external_chat_id: full.external_chat_id,
    conversation_type: full.conversation_type ?? null,
    display_name: full.display_name ?? full.contact_name ?? null,
    contact_name: full.contact_name ?? null,
    phone_number: full.phone_number ?? null,
    avatar_url: avatarUrl,
    final_avatar_url: full.final_avatar_url ?? null,
    last_message_preview: full.last_message_preview ?? null,
    last_message_at: full.last_message_at ?? null,
    unread_count: full.unread_count ?? 0,
    wa_archived: Boolean(full.wa_archived),
    attendance_status: full.attendance_status ?? null,
    assigned_to_user_id: full.assigned_to_user_id ?? null,
    assigned_team_id: full.assigned_team_id ?? null,
    assigned_team_name: full.assigned_team_name ?? null,
    /** Sem estes campos o FE só vê assigned_to_user_id e cai no fallback "Atendente". */
    assignee_email: full.assignee_email ?? null,
    assignee_display: full.assignee_display ?? null,
    assignee_avatar_url: refreshCatalogMediaRelativeSignedUrl(
      typeof full.assignee_avatar_url === 'string' ? full.assignee_avatar_url : null,
    ),
    assigned_at: full.assigned_at ?? null,
    closed_at: full.closed_at ?? null,
    last_assignment_reason: full.last_assignment_reason ?? null,
    queue_id: full.queue_id ?? null,
    client_id: full.client_id ?? null,
    lead_id: full.lead_id ?? full.leadId ?? null,
    link_state: full.link_state ?? null,
    instance_name: full.instance_name ?? null,
    status: full.status ?? null,
    tags,
  };
}

export function extractRowIds(rows: Record<string, unknown>[]): string[] {
  return rows.map((r) => String(r.id));
}
