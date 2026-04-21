/**
 * Escolhe a URL da logo do tenant conforme o tema, com fallbacks seguros.
 * Centralizado para evitar duplicação (sidebar, header, etc.).
 */
export type TenantBrandUrls = {
  logo_light_url?: string | null;
  logo_dark_url?: string | null;
  /** Legado: mantido para tenants antigos e páginas públicas */
  logo_url?: string | null;
};

function normalizeBrandUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (typeof window === 'undefined') return value;
  if (window.location.protocol !== 'https:') return value;
  try {
    const u = new URL(value, window.location.origin);
    // Evita mixed content quando backend gravou http por proxy/protocolo incorreto.
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.toString();
  } catch {
    return value;
  }
}

export function resolveTenantLogoUrl(theme: string | undefined, row: TenantBrandUrls | null | undefined): string | null {
  if (!row) return null;
  const light = normalizeBrandUrl(row.logo_light_url?.trim() || row.logo_url?.trim() || '');
  const dark = normalizeBrandUrl(row.logo_dark_url?.trim() || '');
  const isDark = theme === 'dark';
  if (isDark) {
    if (dark) return dark;
    if (light) return light;
    return null;
  }
  if (light) return light;
  if (dark) return dark;
  return null;
}

/** Indica se há imagem de marca para o tema (texto da empresa não deve duplicar ao lado). */
export function hasTenantLogoForTheme(theme: string | undefined, row: TenantBrandUrls | null | undefined): boolean {
  return resolveTenantLogoUrl(theme, row) != null;
}
