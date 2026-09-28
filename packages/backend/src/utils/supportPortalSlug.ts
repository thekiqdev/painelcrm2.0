/** Slugs reservados (espelho da constraint SQL em tenant_support_portal_settings). */
export const SUPPORT_PORTAL_RESERVED_SLUGS = new Set([
  'admin',
  'superadmin',
  'api',
  'login',
  'dashboard',
  'suporte',
  'support',
  'app',
]);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Evita colisão com URLs de ticket da plataforma (`/suporte/:uuid`). */
const SLUG_LOOKS_LIKE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeSupportPortalSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateSupportPortalSlug(slug: string): { ok: true } | { ok: false; error: string } {
  const s = normalizeSupportPortalSlug(slug);
  if (s.length < 2 || s.length > 80) {
    return { ok: false, error: 'O slug deve ter entre 2 e 80 caracteres.' };
  }
  if (SLUG_LOOKS_LIKE_UUID.test(s)) {
    return { ok: false, error: 'Este formato de slug não é permitido. Escolha outro.' };
  }
  if (!SLUG_RE.test(s)) {
    return { ok: false, error: 'Use apenas letras minúsculas, números e hífens.' };
  }
  if (SUPPORT_PORTAL_RESERVED_SLUGS.has(s)) {
    return { ok: false, error: 'Este endereço está reservado. Escolha outro slug.' };
  }
  return { ok: true };
}
