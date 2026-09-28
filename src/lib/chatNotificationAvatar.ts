import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { getChatInboxAvatarFromCache } from '@/lib/chatNotificationAvatarCache';

/**
 * Avatar para notificações de chat (payload do backend e/ou cache do inbox).
 * Reutiliza `chatAvatarUrlForImgSrc` (incl. proxy para `*.whatsapp.net`).
 * Ordem: `contact_avatar_url` → `avatarUrl` / `avatar_url` → `whatsapp_avatar_url` → cache por `conversationId`.
 */
export function resolveChatNotificationAvatarFromPayload(
  data: Record<string, unknown> | undefined | null,
): string | null {
  if (!data || typeof data !== 'object') return null;
  const primary =
    (typeof data.contact_avatar_url === 'string' && data.contact_avatar_url.trim()) ||
    (typeof data.contactAvatarUrl === 'string' && data.contactAvatarUrl.trim()) ||
    (typeof data.avatarUrl === 'string' && data.avatarUrl.trim()) ||
    (typeof data.avatar_url === 'string' && data.avatar_url.trim()) ||
    '';
  let out = chatAvatarUrlForImgSrc(primary || null);
  if (out) return out;
  const wa =
    (typeof data.whatsapp_avatar_url === 'string' && data.whatsapp_avatar_url.trim()) ||
    (typeof data.whatsappAvatarUrl === 'string' && data.whatsappAvatarUrl.trim()) ||
    '';
  out = chatAvatarUrlForImgSrc(wa || null);
  if (out) return out;
  const cid =
    (typeof data.conversationId === 'string' && data.conversationId.trim()) ||
    (typeof data.conversation_id === 'string' && data.conversation_id.trim()) ||
    '';
  if (cid) {
    return chatAvatarUrlForImgSrc(getChatInboxAvatarFromCache(cid));
  }
  return null;
}
