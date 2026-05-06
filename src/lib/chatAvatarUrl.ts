import { getApiUrl } from '@/integrations/api/client';
import { chatAvatarDebugLog } from '@/lib/chatAvatarDebug';

const CATALOG_MEDIA_RAW_SEGMENT = '/api/public/catalog-media/raw';
const MEDIA_SERVICE_RAW_SEGMENT = '/api/media/v1/raw';

/**
 * Normaliza referências a GET público assinado do MediaService (path relativo ou URL absoluta).
 */
function mediaServiceRawPathFromStored(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith(MEDIA_SERVICE_RAW_SEGMENT)) return t;
  try {
    const u = new URL(t);
    if (u.pathname.includes(MEDIA_SERVICE_RAW_SEGMENT)) {
      return `${u.pathname}${u.search}`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Normaliza qualquer referência a catalog-media/raw (path relativo ou URL absoluta com host/port errados)
 * para um único path `/api/public/catalog-media/raw?...` antes de prefixar a API em dev.
 */
function catalogMediaRawPathFromStored(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith(CATALOG_MEDIA_RAW_SEGMENT)) return t;
  try {
    const u = new URL(t);
    if (u.pathname.includes(CATALOG_MEDIA_RAW_SEGMENT)) {
      return `${u.pathname}${u.search}`;
    }
  } catch {
    return null;
  }
  return null;
}

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

  const catalogRel = catalogMediaRawPathFromStored(t);
  if (catalogRel) {
    const base = getApiUrl();
    const out = base ? `${base.replace(/\/$/, '')}${catalogRel}` : catalogRel;
    chatAvatarDebugLog('chatAvatarUrlForImgSrc', {
      outcome: 'catalog_media_relative',
      prefix: catalogRel.length > 96 ? `${catalogRel.slice(0, 96)}…` : catalogRel,
    });
    return out;
  }

  const mediaRel = mediaServiceRawPathFromStored(t);
  if (mediaRel) {
    const base = getApiUrl();
    const out = base ? `${base.replace(/\/$/, '')}${mediaRel}` : mediaRel;
    chatAvatarDebugLog('chatAvatarUrlForImgSrc', {
      outcome: 'media_service_relative',
      prefix: mediaRel.length > 96 ? `${mediaRel.slice(0, 96)}…` : mediaRel,
    });
    return out;
  }

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

/** Espelha `isUsablePersistedAvatar` do backend — URLs aceites para persistência/exibição estável (não CDN WA, não proxy). */
export function isUsablePersistedAvatarUrl(url: string | null | undefined): boolean {
  if (url == null || typeof url !== 'string') return false;
  const t = url.trim();
  if (!t) return false;
  if (t.includes('/api/chat/avatar-proxy')) return false;
  if (catalogMediaRawPathFromStored(t) || mediaServiceRawPathFromStored(t)) return true;
  try {
    const h = new URL(t).hostname.toLowerCase();
    if (
      h === 'whatsapp.net' ||
      h.endsWith('.whatsapp.net') ||
      h === 'whatsapp.com' ||
      h.endsWith('.whatsapp.com')
    ) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * Mesma ordem que `resolveFinalConversationAvatarUrl` no backend (`uazapiChatIdentity.ts`).
 * Inclui `final_avatar_url` quando a API já resolveu a linha (conversationRowForClientApi).
 */
export function resolveFinalConversationAvatarUrlFrontend(row: Record<string, unknown>): string | null {
  const pick = (u: unknown): string | null => {
    if (typeof u !== 'string') return null;
    const t = u.trim();
    return t && isUsablePersistedAvatarUrl(t) ? t : null;
  };
  return (
    pick(row.final_avatar_url) ||
    pick(row.avatar_cached_url) ||
    pick(row.client_whatsapp_avatar_cached_url) ||
    pick(row.lead_whatsapp_avatar_cached_url) ||
    pick(row.communication_avatar_cached_url) ||
    pick(row.communication_avatar_url) ||
    pick(row.avatar_url) ||
    pick(row.client_whatsapp_avatar_url) ||
    pick(row.lead_whatsapp_avatar_url) ||
    null
  );
}

/** Metadados típicos UazAPI / WhatsApp para foto quando não há URL persistível. */
export function extractUazapiChatImageUrlFromMeta(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const candidates = [
    meta.whatsapp_profile_photo,
    meta.image,
    meta.imagePreview,
    meta.image_preview,
    meta.profilePicUrl,
    meta.profilePicture,
    meta.profilePictureUrl,
    meta.pictureUrl,
    meta.profile_pic_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

/**
 * URL bruta para avatar no chat: catálogo/CRM primeiro; CDN WhatsApp só como último recurso
 * (evita depender do proxy no servidor quando já existe cópia cacheada).
 */
export function pickConversationAvatarRawForDisplay(
  row: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string | null {
  const usable = resolveFinalConversationAvatarUrlFrontend(row);
  if (usable) return usable;
  const fromMeta = extractUazapiChatImageUrlFromMeta(metadata);
  if (fromMeta) return fromMeta;
  const legacyKeys = ['image', 'image_preview', 'imagePreview'] as const;
  for (const k of legacyKeys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const rawAvatarCol =
    typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null;
  if (rawAvatarCol) return rawAvatarCol;
  return null;
}
