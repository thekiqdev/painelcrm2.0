import { pool } from '../utils/db.js';

export type ChatNotificationDisplayContext = {
  contactLabel: string;
  phone: string | null;
  lastMessagePreview: string | null;
};

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
  }>(
    `SELECT display_name, contact_name, profile_name, phone_number, last_message_preview
     FROM chat_conversations WHERE id = $1 LIMIT 1`,
    [conversationId]
  );
  const row = r.rows[0];
  const rawName =
    (row?.display_name && String(row.display_name).trim()) ||
    (row?.contact_name && String(row.contact_name).trim()) ||
    (row?.profile_name && String(row.profile_name).trim()) ||
    '';
  const phone = row?.phone_number?.trim() || null;
  let contactLabel = rawName;
  if (!contactLabel && phone) contactLabel = phone;
  if (!contactLabel) contactLabel = 'Contato WhatsApp';
  return {
    contactLabel,
    phone,
    lastMessagePreview: row?.last_message_preview?.trim() || null,
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
