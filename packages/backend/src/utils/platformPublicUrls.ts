function firstEnvUrl(raw: string | undefined): string {
  return (raw ?? '').split(',')[0]?.trim() ?? '';
}

/**
 * Fallback local alinhado ao Vite (`VITE_DEV_PORT` default 8080).
 * Em dev com porta custom (ex. 8081), defina `PUBLIC_APP_URL` ou `FRONTEND_URL`.
 */
export const LOCAL_PUBLIC_APP_FALLBACK = 'http://localhost:8080';

/** Base pública do site da plataforma (sem barra final). */
export function resolvePlatformPublicAppBaseUrl(): string {
  const fromEnv =
    firstEnvUrl(process.env.PUBLIC_APP_URL) ||
    firstEnvUrl(process.env.FRONTEND_URL) ||
    LOCAL_PUBLIC_APP_FALLBACK;
  return fromEnv.replace(/\/+$/, '');
}

/**
 * Normaliza Origin / Host vindos do browser para base URL sem barra final.
 * Aceita `https://app.com`, `http://localhost:8081` ou host puro (`localhost:8081`).
 * Ignora host da API (ex. `:3001`) para não gerar sale-link no backend.
 */
export function normalizePublicOriginHint(hint: string | null | undefined): string | null {
  const raw = (hint ?? '').trim();
  if (!raw) return null;

  const apiPort = String(process.env.API_PORT || '3001').trim() || '3001';

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (u.port === apiPort) return null;
      return `${u.protocol}//${u.host}`;
    } catch {
      return null;
    }
  }

  // Host header / x-forwarded-host sem scheme
  const host = raw.replace(/\/+$/, '');
  if (!/^[a-z0-9.[\]:_-]+$/i.test(host) || host.includes('://')) return null;
  const lower = host.toLowerCase();
  if (lower.endsWith(`:${apiPort}`)) return null;
  const isLocal =
    lower === 'localhost' ||
    lower.startsWith('localhost:') ||
    lower === '127.0.0.1' ||
    lower.startsWith('127.0.0.1:') ||
    lower === '[::1]' ||
    lower.startsWith('[::1]:');
  return `${isLocal ? 'http' : 'https'}://${host}`;
}

/**
 * Origin do sale-link / URLs públicas: hint do request → env → fallback local.
 */
export function resolveSaleLinkOrigin(opts?: { originHint?: string | null }): string {
  return normalizePublicOriginHint(opts?.originHint) || resolvePlatformPublicAppBaseUrl();
}

function joinUrlPath(base: string, pathSegment: string): string {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = pathSegment.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedPath}`;
}

/** URL de suporte da plataforma para merge fields (`platform.support_link`). */
export function buildPlatformSupportLink(): string {
  const override = process.env.PLATFORM_SUPPORT_URL?.trim();
  if (override) {
    return override.replace(/\/+$/, '');
  }
  return joinUrlPath(resolvePlatformPublicAppBaseUrl(), 'suporte');
}
