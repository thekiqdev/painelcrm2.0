function firstEnvUrl(raw: string | undefined): string {
  return (raw ?? '').split(',')[0]?.trim() ?? '';
}

/** Base pública do site da plataforma (sem barra final). */
export function resolvePlatformPublicAppBaseUrl(): string {
  const fromEnv =
    firstEnvUrl(process.env.PUBLIC_APP_URL) ||
    firstEnvUrl(process.env.FRONTEND_URL) ||
    'http://localhost:5173';
  return fromEnv.replace(/\/+$/, '');
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
