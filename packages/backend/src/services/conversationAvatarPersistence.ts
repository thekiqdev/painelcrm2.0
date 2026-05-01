/**
 * Replica avatar da conversa para clients/leads sem apagar valores existentes (COALESCE).
 */

import { isUsablePersistedAvatar } from '../utils/uazapiChatIdentity.js';
import { pool } from '../utils/db.js';

let hasClientWhatsappAvatarColumnPromise: Promise<boolean> | null = null;
export async function hasClientWhatsappAvatarColumn(): Promise<boolean> {
  if (!hasClientWhatsappAvatarColumnPromise) {
    hasClientWhatsappAvatarColumnPromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'clients'
           AND column_name = 'whatsapp_avatar_url'`,
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasClientWhatsappAvatarColumnPromise;
}

let hasLeadWhatsappAvatarColumnPromise: Promise<boolean> | null = null;
export async function hasLeadWhatsappAvatarColumn(): Promise<boolean> {
  if (!hasLeadWhatsappAvatarColumnPromise) {
    hasLeadWhatsappAvatarColumnPromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'leads'
           AND column_name = 'whatsapp_avatar_url'`,
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasLeadWhatsappAvatarColumnPromise;
}

export async function persistConversationAvatarToCrm(
  userId: string,
  clientId: string | null,
  leadId: string | null,
  avatarUrl: string | null,
  cacheMeta?: {
    cachedUrl: string | null;
    sourceUrl: string | null;
    cachedAt: Date | string | null;
    status: string | null;
  } | null,
): Promise<void> {
  const raw = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';
  const nextAvatar = raw && isUsablePersistedAvatar(raw) ? raw : '';
  const hasCacheMeta = Boolean(
    cacheMeta &&
      (cacheMeta.cachedUrl?.trim() ||
        cacheMeta.sourceUrl?.trim() ||
        cacheMeta.cachedAt ||
        cacheMeta.status?.trim()),
  );
  if (!nextAvatar && !hasCacheMeta) return;

  const ca = cacheMeta?.cachedUrl?.trim() || null;
  const src = cacheMeta?.sourceUrl?.trim() || null;
  const at = cacheMeta?.cachedAt ?? null;
  const st = cacheMeta?.status?.trim() || null;

  if (clientId && (await hasClientWhatsappAvatarColumn())) {
    await pool.query(
      `UPDATE clients
       SET whatsapp_avatar_url = COALESCE(NULLIF(btrim(COALESCE($1::text, '')), ''), whatsapp_avatar_url),
           whatsapp_avatar_cached_url = COALESCE(NULLIF(btrim(COALESCE($4::text, '')), ''), whatsapp_avatar_cached_url),
           whatsapp_avatar_source_url = COALESCE(NULLIF(btrim(COALESCE($5::text, '')), ''), whatsapp_avatar_source_url),
           whatsapp_avatar_cached_at = COALESCE($6::timestamptz, whatsapp_avatar_cached_at),
           whatsapp_avatar_cache_status = COALESCE(NULLIF(btrim(COALESCE($7::text, '')), ''), whatsapp_avatar_cache_status),
           updated_at = now()
       WHERE id = $2 AND user_id = $3`,
      [nextAvatar || null, clientId, userId, ca, src, at, st],
    );
  }

  if (leadId && (await hasLeadWhatsappAvatarColumn())) {
    await pool.query(
      `UPDATE leads
       SET whatsapp_avatar_url = COALESCE(NULLIF(btrim(COALESCE($1::text, '')), ''), whatsapp_avatar_url),
           whatsapp_avatar_cached_url = COALESCE(NULLIF(btrim(COALESCE($4::text, '')), ''), whatsapp_avatar_cached_url),
           whatsapp_avatar_source_url = COALESCE(NULLIF(btrim(COALESCE($5::text, '')), ''), whatsapp_avatar_source_url),
           whatsapp_avatar_cached_at = COALESCE($6::timestamptz, whatsapp_avatar_cached_at),
           whatsapp_avatar_cache_status = COALESCE(NULLIF(btrim(COALESCE($7::text, '')), ''), whatsapp_avatar_cache_status),
           updated_at = now()
       WHERE id = $2 AND user_id = $3`,
      [nextAvatar || null, leadId, userId, ca, src, at, st],
    );
  }
}
