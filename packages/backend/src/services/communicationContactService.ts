import { pool } from '../utils/db.js';
import type { CommunicationProvider as CommunicationProviderKey } from './communication/communicationTypes.js';
import {
  isUsablePersistedAvatar,
  isWhatsAppCdnAvatarUrl,
  mergeAvatarForFinalField,
} from '../utils/uazapiChatIdentity.js';

export type CommunicationProvider = CommunicationProviderKey;

export type UpsertCommunicationContactInput = {
  tenantId: string;
  provider?: CommunicationProvider | string;
  providerContactId?: string | null;
  phone?: string | null;
  username?: string | null;
  displayName?: string | null;
  profileAvatarUrl?: string | null;
  linkedClientId?: string | null;
  linkedLeadId?: string | null;
  rawProfile?: Record<string, unknown> | null;
  avatarCachedUrl?: string | null;
  avatarSourceUrl?: string | null;
  avatarCachedAt?: Date | string | null;
  avatarCacheStatus?: string | null;
};

function pickNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const d = phone.replace(/\D/g, '');
  return d.length ? d : null;
}

export async function upsertCommunicationContactFromProvider(
  input: UpsertCommunicationContactInput
): Promise<{ id: string } | null> {
  const tenantId = input.tenantId;
  const provider = (input.provider || 'whatsapp_uazapi').trim();
  const phone = normalizePhone(input.phone);
  const providerContactId = pickNonEmpty(input.providerContactId ?? null);
  const username = pickNonEmpty(input.username ?? null);
  const displayName = pickNonEmpty(input.displayName ?? null);
  const profileAvatarUrl = pickNonEmpty(input.profileAvatarUrl ?? null);

  if (!tenantId || (!phone && !providerContactId && !username)) return null;

  const existing = await pool.query<{ id: string }>(
    `SELECT id
     FROM communication_contacts
     WHERE tenant_id = $1
       AND provider = $2
       AND (
         ($3::text IS NOT NULL AND btrim($3::text) <> '' AND phone = $3)
         OR ($4::text IS NOT NULL AND btrim($4::text) <> '' AND provider_contact_id = $4)
         OR ($5::text IS NOT NULL AND btrim($5::text) <> '' AND username = $5)
       )
     ORDER BY updated_at DESC
     LIMIT 1`,
    [tenantId, provider, phone, providerContactId, username]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const id = existing.rows[0].id;
    const prev = await pool.query<{
      profile_avatar_url: string | null;
      avatar_cached_url: string | null;
    }>(
      `SELECT profile_avatar_url, avatar_cached_url FROM communication_contacts WHERE id = $1`,
      [id],
    );
    const prow = prev.rows[0];
    const incomingCached = pickNonEmpty(input.avatarCachedUrl ?? null);
    let finalProfile = mergeAvatarForFinalField({
      existingFinalUrl: prow?.profile_avatar_url ?? null,
      existingCachedUrl: prow?.avatar_cached_url ?? null,
      incomingCachedUrl: incomingCached,
    });
    if (!finalProfile && profileAvatarUrl && isUsablePersistedAvatar(profileAvatarUrl)) {
      finalProfile = profileAvatarUrl;
    }

    const sourceForDb = pickNonEmpty(
      input.avatarSourceUrl ?? null,
      profileAvatarUrl && isWhatsAppCdnAvatarUrl(profileAvatarUrl) ? profileAvatarUrl : null,
    );

    await pool.query(
      `UPDATE communication_contacts
       SET
         provider_contact_id = COALESCE($2, provider_contact_id),
         phone = COALESCE($3, phone),
         username = COALESCE($4, username),
         display_name = COALESCE($5, display_name),
         profile_avatar_url = COALESCE(NULLIF(btrim(COALESCE($6::text, '')), ''), profile_avatar_url),
         linked_client_id = COALESCE($7, linked_client_id),
         linked_lead_id = COALESCE($8, linked_lead_id),
         raw_profile = COALESCE($9::jsonb, raw_profile),
         avatar_cached_url = COALESCE(NULLIF(btrim(COALESCE($10::text, '')), ''), avatar_cached_url),
         avatar_source_url = COALESCE(NULLIF(btrim(COALESCE($11::text, '')), ''), avatar_source_url),
         avatar_cached_at = COALESCE($12::timestamptz, avatar_cached_at),
         avatar_cache_status = COALESCE(NULLIF(btrim(COALESCE($13::text, '')), ''), avatar_cache_status),
         last_seen_at = now(),
         last_profile_sync_at = CASE
           WHEN $5::text IS NOT NULL OR ($6::text IS NOT NULL AND btrim($6::text) <> '') OR $9::jsonb IS NOT NULL
             THEN now()
           ELSE last_profile_sync_at
         END,
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        providerContactId,
        phone,
        username,
        displayName,
        finalProfile,
        input.linkedClientId ?? null,
        input.linkedLeadId ?? null,
        input.rawProfile ? JSON.stringify(input.rawProfile) : null,
        input.avatarCachedUrl ?? null,
        sourceForDb,
        input.avatarCachedAt ?? null,
        input.avatarCacheStatus ?? null,
      ]
    );
    return { id };
  }

  const incomingCachedIns = pickNonEmpty(input.avatarCachedUrl ?? null);
  let finalInsertProfile = mergeAvatarForFinalField({
    existingFinalUrl: null,
    existingCachedUrl: null,
    incomingCachedUrl: incomingCachedIns,
  });
  if (!finalInsertProfile && profileAvatarUrl && isUsablePersistedAvatar(profileAvatarUrl)) {
    finalInsertProfile = profileAvatarUrl;
  }
  const insertSource = pickNonEmpty(
    input.avatarSourceUrl ?? null,
    profileAvatarUrl && isWhatsAppCdnAvatarUrl(profileAvatarUrl) ? profileAvatarUrl : null,
  );

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO communication_contacts (
       tenant_id,
       provider,
       provider_contact_id,
       phone,
       username,
       display_name,
       profile_avatar_url,
       avatar_cached_url,
       avatar_source_url,
       linked_client_id,
       linked_lead_id,
       raw_profile,
       first_seen_at,
       last_seen_at,
       last_profile_sync_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now(), now(),
       CASE WHEN $6::text IS NOT NULL OR ($7::text IS NOT NULL AND btrim($7::text) <> '') OR $12::jsonb IS NOT NULL THEN now() ELSE NULL END
     )
     RETURNING id`,
    [
      tenantId,
      provider,
      providerContactId,
      phone,
      username,
      displayName,
      finalInsertProfile,
      incomingCachedIns,
      insertSource,
      input.linkedClientId ?? null,
      input.linkedLeadId ?? null,
      input.rawProfile ? JSON.stringify(input.rawProfile) : null,
    ]
  );

  return inserted.rows[0] ?? null;
}

export async function linkCommunicationContactToClient(
  id: string,
  clientId: string
): Promise<void> {
  await pool.query(
    `UPDATE communication_contacts
     SET linked_client_id = $2, updated_at = now()
     WHERE id = $1`,
    [id, clientId]
  );
}

export async function linkCommunicationContactToLead(
  id: string,
  leadId: string
): Promise<void> {
  await pool.query(
    `UPDATE communication_contacts
     SET linked_lead_id = $2, updated_at = now()
     WHERE id = $1`,
    [id, leadId]
  );
}

export function resolveCommunicationDisplayIdentity(input: {
  clientName?: string | null;
  leadName?: string | null;
  communicationDisplayName?: string | null;
  providerName?: string | null;
  phone?: string | null;
}): string {
  return (
    pickNonEmpty(
      input.clientName ?? null,
      input.leadName ?? null,
      input.communicationDisplayName ?? null,
      input.providerName ?? null,
      input.phone ?? null
    ) || 'Sem nome'
  );
}

