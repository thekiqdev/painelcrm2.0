import { extractCatalogMediaRelativeKeyFromStoredUrl } from './catalogMediaPublicSignedUrl.js';

/** URL hospedada no nosso catálogo (assinada) — estável; não substituir por CDN efémera. */
export function isPersistentStoredAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (!t) return false;
  /** Catálogo local: path relativo ou absoluto antigo com qualquer host */
  if (t.includes('/api/public/catalog-media/raw')) return true;
  return extractCatalogMediaRelativeKeyFromStoredUrl(t) != null;
}

export function isWhatsAppCdnAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const h = new URL(url.trim()).hostname.toLowerCase();
    return (
      h === 'whatsapp.net' ||
      h.endsWith('.whatsapp.net') ||
      h === 'whatsapp.com' ||
      h.endsWith('.whatsapp.com')
    );
  } catch {
    return false;
  }
}

/** Alias semântico (hostname whatsapp.net / whatsapp.com). */
export const isWhatsappCdnUrl = isWhatsAppCdnAvatarUrl;

/** URL do proxy HTTP — não persistir em campos finais de avatar. */
export function isChatAvatarProxyUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('/api/chat/avatar-proxy');
}

/**
 * URL aceitável para gravar em campos finais (avatar_url, whatsapp_avatar_url, contact_avatar_url):
 * não vazia, não CDN WhatsApp, não proxy interno.
 */
export function isUsablePersistedAvatar(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (!t) return false;
  if (isChatAvatarProxyUrl(t)) return false;
  if (isWhatsAppCdnAvatarUrl(t)) return false;
  return true;
}

/**
 * Escolhe o URL final persistível: prioriza novo cache, depois cache existente, depois final existente.
 * Nunca devolve CDN WhatsApp nem URL de proxy.
 */
export function mergeAvatarForFinalField(params: {
  existingFinalUrl?: string | null;
  existingCachedUrl?: string | null;
  incomingCachedUrl?: string | null;
}): string | null {
  const { existingFinalUrl, existingCachedUrl, incomingCachedUrl } = params;
  if (isUsablePersistedAvatar(incomingCachedUrl)) return String(incomingCachedUrl).trim();
  if (isUsablePersistedAvatar(existingCachedUrl)) return String(existingCachedUrl).trim();
  if (isUsablePersistedAvatar(existingFinalUrl)) return String(existingFinalUrl).trim();
  return null;
}

/**
 * Avatar único para API do chat: prioriza cache local/catálogo, CRM e contact; ignora CDN/proxy.
 * Campos esperados no row (aliases da query GET /conversations): ver documentação do endpoint.
 */
export function resolveFinalConversationAvatarUrl(row: Record<string, unknown>): string | null {
  const pick = (u: unknown): string | null => {
    if (typeof u !== 'string') return null;
    const t = u.trim();
    return t && isUsablePersistedAvatar(t) ? t : null;
  };

  return (
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

/**
 * Regra de persistência: só substitui avatar quando o incoming é URL não vazia;
 * nunca gravar null por cima de valor já salvo (sync/webhook sem foto).
 * Nunca substituir URL já cacheada em catálogo por URL efémera da CDN WhatsApp.
 * Nunca gravar CDN/proxy como valor final quando não há alternativa útil.
 */
export function mergeAvatarUrlForPersistence(
  incoming: string | null | undefined,
  existing: string | null | undefined
): string | null {
  const inc = typeof incoming === 'string' && incoming.trim() ? incoming.trim() : null;
  const ex = typeof existing === 'string' && existing.trim() ? existing.trim() : null;

  const incIsUnusableFinal = inc && (isWhatsAppCdnAvatarUrl(inc) || isChatAvatarProxyUrl(inc));
  if (incIsUnusableFinal) {
    if (ex && isUsablePersistedAvatar(ex)) return ex;
    if (ex && isPersistentStoredAvatarUrl(ex)) return ex;
    return null;
  }

  if (inc && ex && isWhatsAppCdnAvatarUrl(inc) && isPersistentStoredAvatarUrl(ex)) {
    return ex;
  }

  if (inc) return inc;
  if (ex && isUsablePersistedAvatar(ex)) return ex;
  return null;
}

/**
 * Campos de foto conforme schema Chat em docs/uazapi-openapi-spec.yaml:
 * - image (URL da imagem do chat)
 * - imagePreview (URL da miniatura — camelCase na API)
 * Variações snake_case podem aparecer em webhooks legados.
 */
export function extractUazapiChatImageUrl(meta: Record<string, unknown> | null | undefined): string | null {
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
 * Nome exibido do chat (OpenAPI): `name` é o nome consolidado na UI UazAPI;
 * depois wa_contactName, wa_name, etc.
 */
export function extractUazapiChatDisplayName(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidates = [
    raw.name,
    raw.wa_contactName,
    raw.wa_name,
    raw.contactName,
    raw.lead_name,
    raw.displayName,
    raw.pushName,
    raw.notifyName,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      const t = c.trim();
      if (t.toLowerCase().includes('@lid')) continue;
      if (/^\d{12,22}$/.test(t.replace(/\s/g, ''))) continue;
      return t;
    }
  }
  return null;
}
