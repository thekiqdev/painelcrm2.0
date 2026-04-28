/**
 * Origens permitidas para CORS (HTTP Express e Socket.IO).
 * Mantém FRONTEND_URL(S) + hosts locais de desenvolvimento comuns.
 */
export function getAllowedCorsOrigins(): string[] {
  const extraOrigins = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '';
  const parsedExtraOrigins = extraOrigins
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .flatMap((url) => [url, url.replace(/\/$/, '')]);

  return [
    ...new Set([
      ...parsedExtraOrigins,
      'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:8081',
    ]),
  ];
}
