import { getApiUrl } from '@/integrations/api/client';
import { chatAvatarDebugLog } from '@/lib/chatAvatarDebug';

function hostnameHint(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Hosts que não podem ser usados em <img src> direto — servidos via `/api/chat/avatar-proxy`. */
function isWhatsappProviderAvatarHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'whatsapp.net' ||
    h.endsWith('.whatsapp.net') ||
    h === 'whatsapp.com' ||
    h.endsWith('.whatsapp.com')
  );
}

/**
 * @deprecated usar `isWhatsappProviderAvatarHost` via URL; mantido para compat.
 */
export function isWhatsappCdnBlockedInBrowser(url: string | null | undefined): boolean {
  if (url == null || typeof url !== 'string') return false;
  const s = url.trim();
  if (!s) return false;
  try {
    return isWhatsappProviderAvatarHost(new URL(s).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * URL para AvatarImage: WhatsApp CDN → proxy API autenticado (blob no cliente); demais URLs diretas.
 */
export function chatAvatarUrlForImgSrc(url: string | null | undefined): string | null {
  if (url == null || typeof url !== 'string') return null;
  const t = url.trim();
  if (!t) return null;
  try {
    const host = new URL(t).hostname.toLowerCase();
    if (isWhatsappProviderAvatarHost(host)) {
      const path = `/api/chat/avatar-proxy?url=${encodeURIComponent(t)}`;
      const base = getApiUrl();
      const full = base ? `${base.replace(/\/$/, '')}${path}` : path;
      chatAvatarDebugLog('chatAvatarUrlForImgSrc', {
        outcome: 'via_proxy',
        host,
        prefix: t.length > 96 ? `${t.slice(0, 96)}…` : t,
      });
      return full;
    }
  } catch {
    return null;
  }
  chatAvatarDebugLog('chatAvatarUrlForImgSrc', {
    outcome: 'direct',
    host: hostnameHint(t),
    prefix: t.length > 96 ? `${t.slice(0, 96)}…` : t,
  });
  return t;
}
