/**
 * Regra de persistência: só substitui avatar quando o incoming é URL não vazia;
 * nunca gravar null por cima de valor já salvo (sync/webhook sem foto).
 */
export function mergeAvatarUrlForPersistence(
  incoming: string | null | undefined,
  existing: string | null | undefined
): string | null {
  const inc = typeof incoming === 'string' && incoming.trim() ? incoming.trim() : null;
  if (inc) return inc;
  const ex = typeof existing === 'string' && existing.trim() ? existing.trim() : null;
  return ex;
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
