/**
 * Backfill em lote pequeno: conversas + CRM com URL CDN WhatsApp ainda não cacheadas.
 */

import { pool } from '../utils/db.js';
import {
  cacheWhatsappAvatarToCatalog,
  ensureConversationAvatarCachedAndReplicateToCrm,
  ensureCrmWhatsappAvatarCached,
} from './whatsappAvatarCacheService.js';

async function tenantForUser(userId: string): Promise<string | null> {
  const r = await pool.query<{ tenant_id: string | null }>(
    `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0]?.tenant_id ?? null;
}

export type AvatarCacheBackfillResult = {
  limit: number;
  conversations: number;
  clients: number;
  leads: number;
  notifications: number;
};

export type AvatarFinalFieldRepairResult = {
  limit: number;
  conversations: number;
  clients: number;
  leads: number;
  notifications: number;
};

/**
 * Repara campos finais já corrompidos (CDN/proxy) quando existe URL cacheada estável na coluna auxiliar.
 * Notificações: remove chaves com CDN/proxy em `data` (sem apagar outro conteúdo).
 */
export async function runAvatarFinalFieldRepairBatch(limit: number): Promise<AvatarFinalFieldRepairResult> {
  const n = Math.max(1, Math.min(200, limit));

  const conv = await pool.query(
    `WITH todo AS (
       SELECT id FROM chat_conversations
       WHERE btrim(COALESCE(avatar_cached_url, '')) <> ''
         AND avatar_cached_url NOT ILIKE '%whatsapp.net%'
         AND avatar_cached_url NOT ILIKE '%whatsapp.com%'
         AND (
           avatar_url ILIKE '%whatsapp.net%'
           OR avatar_url ILIKE '%whatsapp.com%'
           OR avatar_url ILIKE '%/api/chat/avatar-proxy%'
           OR btrim(COALESCE(avatar_url, '')) = ''
         )
       ORDER BY updated_at DESC NULLS LAST
       LIMIT $1
     )
     UPDATE chat_conversations c
     SET avatar_url = c.avatar_cached_url, updated_at = now()
     FROM todo t WHERE c.id = t.id
     RETURNING c.id`,
    [n],
  );

  const clientsR = await pool.query(
    `WITH todo AS (
       SELECT id FROM clients
       WHERE btrim(COALESCE(whatsapp_avatar_cached_url, '')) <> ''
         AND whatsapp_avatar_cached_url NOT ILIKE '%whatsapp.net%'
         AND whatsapp_avatar_cached_url NOT ILIKE '%whatsapp.com%'
         AND (
           whatsapp_avatar_url ILIKE '%whatsapp.net%'
           OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
           OR whatsapp_avatar_url ILIKE '%/api/chat/avatar-proxy%'
           OR btrim(COALESCE(whatsapp_avatar_url, '')) = ''
         )
       ORDER BY updated_at DESC NULLS LAST
       LIMIT $1
     )
     UPDATE clients c
     SET whatsapp_avatar_url = c.whatsapp_avatar_cached_url, updated_at = now()
     FROM todo t WHERE c.id = t.id
     RETURNING c.id`,
    [n],
  );

  const leadsR = await pool.query(
    `WITH todo AS (
       SELECT id FROM leads
       WHERE btrim(COALESCE(whatsapp_avatar_cached_url, '')) <> ''
         AND whatsapp_avatar_cached_url NOT ILIKE '%whatsapp.net%'
         AND whatsapp_avatar_cached_url NOT ILIKE '%whatsapp.com%'
         AND (
           whatsapp_avatar_url ILIKE '%whatsapp.net%'
           OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
           OR whatsapp_avatar_url ILIKE '%/api/chat/avatar-proxy%'
           OR btrim(COALESCE(whatsapp_avatar_url, '')) = ''
         )
       ORDER BY updated_at DESC NULLS LAST
       LIMIT $1
     )
     UPDATE leads l
     SET whatsapp_avatar_url = l.whatsapp_avatar_cached_url, updated_at = now()
     FROM todo t WHERE l.id = t.id
     RETURNING l.id`,
    [n],
  );

  const notif = await pool.query(
    `WITH todo AS (
       SELECT id FROM notifications
       WHERE (
         (data->>'contact_avatar_url') ILIKE '%whatsapp.net%'
         OR (data->>'contact_avatar_url') ILIKE '%whatsapp.com%'
         OR (data->>'contact_avatar_url') ILIKE '%/api/chat/avatar-proxy%'
         OR (data->>'avatarUrl') ILIKE '%whatsapp.net%'
         OR (data->>'avatarUrl') ILIKE '%whatsapp.com%'
         OR (data->>'avatarUrl') ILIKE '%/api/chat/avatar-proxy%'
       )
       ORDER BY created_at DESC NULLS LAST
       LIMIT $1
     )
     UPDATE notifications n
     SET data = (n.data - 'contact_avatar_url' - 'avatarUrl')
     FROM todo t WHERE n.id = t.id
     RETURNING n.id`,
    [n],
  );

  return {
    limit: n,
    conversations: conv.rowCount ?? 0,
    clients: clientsR.rowCount ?? 0,
    leads: leadsR.rowCount ?? 0,
    notifications: notif.rowCount ?? 0,
  };
}

export async function runWhatsappAvatarCacheBackfillBatch(limit: number): Promise<AvatarCacheBackfillResult> {
  const perType = Math.max(1, Math.min(100, limit));
  let convN = 0;
  const convRows = await pool.query<{ id: string; user_id: string }>(
    `SELECT c.id, c.user_id
     FROM chat_conversations c
     WHERE (c.avatar_url ILIKE '%whatsapp.net%' OR c.avatar_url ILIKE '%whatsapp.com%')
     ORDER BY c.updated_at DESC NULLS LAST
     LIMIT $1`,
    [perType],
  );
  for (const row of convRows.rows) {
    const tenantId = await tenantForUser(row.user_id);
    await ensureConversationAvatarCachedAndReplicateToCrm({
      conversationId: row.id,
      userId: row.user_id,
      tenantId,
    });
    convN += 1;
  }

  let clientN = 0;
  const clientRows = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM clients
     WHERE whatsapp_avatar_url ILIKE '%whatsapp.net%' OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
     ORDER BY updated_at DESC NULLS LAST
     LIMIT $1`,
    [perType],
  );
  for (const row of clientRows.rows) {
    const tenantId = await tenantForUser(row.user_id);
    await ensureCrmWhatsappAvatarCached({
      kind: 'client',
      entityId: row.id,
      userId: row.user_id,
      tenantId,
    });
    clientN += 1;
  }

  let leadN = 0;
  const leadRows = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM leads
     WHERE whatsapp_avatar_url ILIKE '%whatsapp.net%' OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
     ORDER BY updated_at DESC NULLS LAST
     LIMIT $1`,
    [perType],
  );
  for (const row of leadRows.rows) {
    const tenantId = await tenantForUser(row.user_id);
    await ensureCrmWhatsappAvatarCached({
      kind: 'lead',
      entityId: row.id,
      userId: row.user_id,
      tenantId,
    });
    leadN += 1;
  }

  let notifN = 0;
  const notifRows = await pool.query<{ id: string; user_id: string; data: Record<string, unknown> }>(
    `SELECT id, user_id, data FROM notifications
     WHERE (
       (data->>'contact_avatar_url') ILIKE '%whatsapp.net%'
       OR (data->>'contact_avatar_url') ILIKE '%whatsapp.com%'
     )
     ORDER BY created_at DESC NULLS LAST
     LIMIT $1`,
    [perType],
  );
  for (const row of notifRows.rows) {
    const raw = row.data?.contact_avatar_url;
    const url = typeof raw === 'string' && raw.trim() ? raw.trim() : '';
    if (!url) continue;
    const tenantId = await tenantForUser(row.user_id);
    const cached = await cacheWhatsappAvatarToCatalog({
      tenantId,
      userId: row.user_id,
      sourceUrl: url,
    });
    if (!cached) continue;
    const newData = { ...row.data, contact_avatar_url: cached };
    await pool.query(`UPDATE notifications SET data = $2::jsonb WHERE id = $1`, [
      row.id,
      JSON.stringify(newData),
    ]);
    notifN += 1;
  }

  return {
    limit: perType,
    conversations: convN,
    clients: clientN,
    leads: leadN,
    notifications: notifN,
  };
}
