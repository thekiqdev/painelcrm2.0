/**
 * Log estruturado após upsert de identidade — `CHAT_AVATAR_DEBUG=true`.
 */

import { pool } from './db.js';
import { chatAvatarDebugLog, isChatAvatarDebugEnabled } from './chatAvatarDebug.js';
import { extractUazapiChatImageUrl } from './uazapiChatIdentity.js';

export async function logChatAvatarSyncResult(args: {
  conversationId: string;
  tenantId: string | null;
  normalizedMetadata: Record<string, unknown>;
  upsertedRow: Record<string, unknown>;
}): Promise<void> {
  if (!isChatAvatarDebugEnabled()) return;

  const provider_avatar_url_found = extractUazapiChatImageUrl(args.normalizedMetadata);
  let provider_avatar_host: string | null = null;
  if (provider_avatar_url_found) {
    try {
      provider_avatar_host = new URL(provider_avatar_url_found).hostname.toLowerCase();
    } catch {
      provider_avatar_host = null;
    }
  }

  const final_avatar_url =
    typeof args.upsertedRow.avatar_url === 'string' && args.upsertedRow.avatar_url.trim()
      ? args.upsertedRow.avatar_url.trim()
      : null;
  const client_id =
    (args.upsertedRow.client_id as string | null | undefined) ?? null;
  const lead_id = (args.upsertedRow.lead_id as string | null | undefined) ?? null;
  const preserved_existing_avatar = !provider_avatar_url_found && !!final_avatar_url;

  let saved_communication_contact_avatar: string | null = null;
  const ccId = args.upsertedRow.communication_contact_id as string | null | undefined;
  if (ccId && args.tenantId) {
    const cc = await pool.query<{ profile_avatar_url: string | null }>(
      `SELECT profile_avatar_url FROM communication_contacts WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [ccId, args.tenantId]
    );
    saved_communication_contact_avatar = cc.rows[0]?.profile_avatar_url ?? null;
  }

  let saved_client_avatar: string | null = null;
  if (client_id) {
    const c = await pool.query<{ whatsapp_avatar_url: string | null }>(
      `SELECT whatsapp_avatar_url FROM clients WHERE id = $1 LIMIT 1`,
      [client_id]
    );
    saved_client_avatar = c.rows[0]?.whatsapp_avatar_url ?? null;
  }

  let saved_lead_avatar: string | null = null;
  if (lead_id) {
    const l = await pool.query<{ whatsapp_avatar_url: string | null }>(
      `SELECT whatsapp_avatar_url FROM leads WHERE id = $1 LIMIT 1`,
      [lead_id]
    );
    saved_lead_avatar = l.rows[0]?.whatsapp_avatar_url ?? null;
  }

  chatAvatarDebugLog('chat_avatar_sync_result', {
    event: 'chat_avatar_sync_result',
    conversation_id: args.conversationId,
    tenant_id: args.tenantId,
    client_id,
    lead_id,
    provider_avatar_url_found,
    provider_avatar_host,
    saved_conversation_avatar: final_avatar_url,
    saved_communication_contact_avatar,
    saved_client_avatar,
    saved_lead_avatar,
    preserved_existing_avatar,
    final_avatar_url,
  });
}
