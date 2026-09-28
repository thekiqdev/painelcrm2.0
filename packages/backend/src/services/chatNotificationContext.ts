import { pool } from '../utils/db.js';
import { isUsablePersistedAvatar } from '../utils/uazapiChatIdentity.js';

export type ChatNotificationDisplayContext = {
  contactLabel: string;
  phone: string | null;
  lastMessagePreview: string | null;
  /** URL bruta (mesma prioridade que `resolveConversationIdentity` no frontend). */
  avatarUrl: string | null;
  clientId: string | null;
  leadId: string | null;
  /** Apenas `clients.whatsapp_avatar_url` ou `leads.whatsapp_avatar_url` (ex.: retorno de fallback na UI). */
  crmWhatsappAvatarUrl: string | null;
};

/**
 * Enriquecimento padrão do JSON `notifications.data` para o inbox / sininho.
 * Mantém as chaves antigas (`conversationId`, `avatarUrl`) e acrescenta snake_case para persistência/retrocompat.
 */
export function mergeConversationFieldsIntoNotificationData(
  conversationId: string,
  data: Record<string, unknown>,
  ctx: ChatNotificationDisplayContext | null
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...data,
    conversationId,
    conversation_id: conversationId,
  };
  if (!ctx) return base;
  if (ctx.clientId) base.client_id = ctx.clientId;
  if (ctx.leadId) base.lead_id = ctx.leadId;
  if (ctx.crmWhatsappAvatarUrl && isUsablePersistedAvatar(ctx.crmWhatsappAvatarUrl)) {
    base.whatsapp_avatar_url = ctx.crmWhatsappAvatarUrl;
  }
  if (ctx.avatarUrl && isUsablePersistedAvatar(ctx.avatarUrl)) {
    base.avatarUrl = ctx.avatarUrl;
    base.contact_avatar_url = ctx.avatarUrl;
  }
  return base;
}

function trimUrl(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function metaPick(meta: unknown, keys: string[]): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  for (const k of keys) {
    const u = trimUrl(m[k]);
    if (u) return u;
  }
  return null;
}

/**
 * Mesma ordem que `resolveConversationIdentity` em `src/utils/chatIdentityDisplay.ts`.
 */
export function resolveChatAvatarUrlFromConversationRow(row: {
  avatar_cached_url?: unknown;
  avatar_url?: unknown;
  metadata?: unknown;
  client_id?: unknown;
  lead_id?: unknown;
  communication_avatar_url?: unknown;
  client_whatsapp_avatar_url?: unknown;
  lead_whatsapp_avatar_url?: unknown;
  client_whatsapp_avatar_cached_url?: unknown;
  lead_whatsapp_avatar_cached_url?: unknown;
}): string | null {
  const pickUsable = (u: string | null): string | null =>
    u && isUsablePersistedAvatar(u) ? u : null;

  const fromConvCached = pickUsable(trimUrl(row.avatar_cached_url));
  if (fromConvCached) return fromConvCached;
  const fromConv = pickUsable(trimUrl(row.avatar_url));
  if (fromConv) return fromConv;
  const fromComm = pickUsable(trimUrl(row.communication_avatar_url));
  if (fromComm) return fromComm;
  const hasClient = row.client_id != null && String(row.client_id).trim() !== '';
  const hasLead = row.lead_id != null && String(row.lead_id).trim() !== '';
  const fromCrmWa = hasClient
    ? pickUsable(trimUrl(row.client_whatsapp_avatar_cached_url)) ||
      pickUsable(trimUrl(row.client_whatsapp_avatar_url))
    : hasLead
      ? pickUsable(trimUrl(row.lead_whatsapp_avatar_cached_url)) ||
        pickUsable(trimUrl(row.lead_whatsapp_avatar_url))
      : null;
  if (fromCrmWa) return fromCrmWa;
  const meta = row.metadata;
  const fromMetaProfile = pickUsable(metaPick(meta, ['profile_picture_url', 'profilePictureUrl', 'profilePicture']));
  if (fromMetaProfile) return fromMetaProfile;
  const fromMetaWaImage = pickUsable(
    metaPick(meta, ['whatsapp_profile_photo', 'image', 'imagePreview', 'image_preview']),
  );
  if (fromMetaWaImage) return fromMetaWaImage;

  return null;
}

/** Rótulo seguro para cópias de notificação (evita IDs e @lid cru). */
export async function loadChatNotificationDisplayContext(
  conversationId: string
): Promise<ChatNotificationDisplayContext> {
  const r = await pool.query<{
    display_name: string | null;
    contact_name: string | null;
    profile_name: string | null;
    phone_number: string | null;
    last_message_preview: string | null;
    avatar_url: string | null;
    avatar_cached_url: string | null;
    metadata: unknown;
    client_id: string | null;
    lead_id: string | null;
    communication_avatar_url: string | null;
    client_whatsapp_avatar_url: string | null;
    lead_whatsapp_avatar_url: string | null;
    client_whatsapp_avatar_cached_url: string | null;
    lead_whatsapp_avatar_cached_url: string | null;
  }>(
    `SELECT
       c.display_name,
       c.contact_name,
       c.profile_name,
       c.phone_number,
       c.last_message_preview,
       c.avatar_url,
       c.avatar_cached_url,
       c.metadata,
       c.client_id,
       c.lead_id,
       cc.profile_avatar_url AS communication_avatar_url,
       cl.whatsapp_avatar_url AS client_whatsapp_avatar_url,
       l.whatsapp_avatar_url AS lead_whatsapp_avatar_url,
       cl.whatsapp_avatar_cached_url AS client_whatsapp_avatar_cached_url,
       l.whatsapp_avatar_cached_url AS lead_whatsapp_avatar_cached_url
     FROM chat_conversations c
     LEFT JOIN communication_contacts cc ON cc.id = c.communication_contact_id
     LEFT JOIN clients cl ON cl.id = c.client_id
     LEFT JOIN leads l ON l.id = c.lead_id
     WHERE c.id = $1
     LIMIT 1`,
    [conversationId]
  );
  const row = r.rows[0];
  if (!row) {
    return {
      contactLabel: 'Contato WhatsApp',
      phone: null,
      lastMessagePreview: null,
      avatarUrl: null,
      clientId: null,
      leadId: null,
      crmWhatsappAvatarUrl: null,
    };
  }
  const rawName =
    (row.display_name && String(row.display_name).trim()) ||
    (row.contact_name && String(row.contact_name).trim()) ||
    (row.profile_name && String(row.profile_name).trim()) ||
    '';
  const phone = row.phone_number?.trim() || null;
  let contactLabel = rawName;
  if (!contactLabel && phone) contactLabel = phone;
  if (!contactLabel) contactLabel = 'Contato WhatsApp';

  const avatarUrl = resolveChatAvatarUrlFromConversationRow(row);
  const hasClient = row.client_id != null && String(row.client_id).trim() !== '';
  const hasLead = row.lead_id != null && String(row.lead_id).trim() !== '';
  const crmWhatsappAvatarUrl = hasClient
    ? trimUrl(row.client_whatsapp_avatar_cached_url) || trimUrl(row.client_whatsapp_avatar_url)
    : hasLead
      ? trimUrl(row.lead_whatsapp_avatar_cached_url) || trimUrl(row.lead_whatsapp_avatar_url)
      : null;

  return {
    contactLabel,
    phone,
    lastMessagePreview: row.last_message_preview?.trim() || null,
    avatarUrl,
    clientId: hasClient ? String(row.client_id) : null,
    leadId: hasLead ? String(row.lead_id) : null,
    crmWhatsappAvatarUrl,
  };
}

export async function loadUserShortDisplay(userId: string): Promise<string | null> {
  const r = await pool.query<{ first_name: string | null; last_name: string | null; email: string | null }>(
    `SELECT first_name, last_name, email FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const u = r.rows[0];
  if (!u) return null;
  const n = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  if (n) return n;
  return u.email?.trim() || null;
}

export async function loadQueueName(queueId: string | null | undefined): Promise<string | null> {
  if (!queueId) return null;
  const r = await pool.query<{ name: string }>(`SELECT name FROM chat_queues WHERE id = $1 LIMIT 1`, [queueId]);
  return r.rows[0]?.name?.trim() || null;
}

export function chatInboxHref(conversationId: string): string {
  return `/chat?conversationId=${encodeURIComponent(conversationId)}`;
}
