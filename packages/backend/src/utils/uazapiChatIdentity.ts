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
  const candidates = [raw.name, raw.wa_contactName, raw.wa_name, raw.contactName, raw.lead_name];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}
