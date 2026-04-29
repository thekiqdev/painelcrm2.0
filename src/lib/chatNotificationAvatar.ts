import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';

/**
 * Avatar para notificações de chat (payload sanitizado do backend).
 * Reutiliza `chatAvatarUrlForImgSrc` como no inbox/listas do chat.
 */
export function resolveChatNotificationAvatarFromPayload(
  data: Record<string, unknown> | undefined | null,
): string | null {
  if (!data || typeof data !== 'object') return null;
  const raw =
    (typeof data.avatarUrl === 'string' && data.avatarUrl.trim()) ||
    (typeof data.avatar_url === 'string' && data.avatar_url.trim()) ||
    '';
  return chatAvatarUrlForImgSrc(raw || null);
}
