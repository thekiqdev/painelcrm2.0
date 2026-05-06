/**
 * Remove apenas origins de desenvolvimento localhost em URLs internas de mídia.
 * Não altera whatsapp.net, URLs externas ou paths que não sejam catálogo interno.
 */
const LOCALHOST_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:3002',
  'https://localhost:3001',
  'https://localhost:3002',
] as const;

export function stripLocalhostInternalMediaUrl(value: string | null | undefined): {
  next: string;
  changed: boolean;
} {
  if (value == null || typeof value !== 'string') {
    return { next: '', changed: false };
  }
  const t = value.trim();
  if (!t) {
    return { next: t, changed: false };
  }
  if (/whatsapp\.net/i.test(t)) {
    return { next: t, changed: false };
  }
  for (const origin of LOCALHOST_ORIGINS) {
    if (t.startsWith(origin)) {
      const rest = t.slice(origin.length);
      if (
        rest.startsWith('/api/public/catalog-media/raw') ||
        rest.startsWith('/media/catalog')
      ) {
        return { next: rest, changed: rest !== t };
      }
      return { next: t, changed: false };
    }
  }
  return { next: t, changed: false };
}

export function summarizeUrlForLog(u: string, max = 96): string {
  const s = u.length <= max ? u : `${u.slice(0, max)}…`;
  return s.replace(/\s+/g, ' ');
}
