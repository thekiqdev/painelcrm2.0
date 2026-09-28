const INTERNAL_MEDIA_PATHS = ['/api/media/v1/raw', '/api/public/catalog-media/raw', '/media/catalog'];

export function isWhatsappCdnUrl(input: string | null | undefined): boolean {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return false;
  return s.includes('whatsapp.net') || s.includes('whatsapp.com');
}

export function isLocalhostUrl(input: string | null | undefined): boolean {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return false;
  return s.startsWith('http://localhost:') || s.startsWith('https://localhost:') || s.includes('://127.0.0.1:');
}

export function isInternalMediaUrl(input: string | null | undefined): boolean {
  const s = String(input || '').trim();
  if (!s) return false;
  return INTERNAL_MEDIA_PATHS.some((p) => s.startsWith(p));
}

export function stripOriginFromInternalMediaUrl(input: string | null | undefined): string {
  const s = String(input || '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    const pathAndQuery = `${url.pathname}${url.search}`;
    if (isInternalMediaUrl(pathAndQuery)) return pathAndQuery;
    return s;
  } catch {
    return s;
  }
}

export function normalizePersistedMediaUrl(input: string | null | undefined): string {
  const s = String(input || '').trim();
  if (!s) return '';
  if (isInternalMediaUrl(s)) return s;
  if (isLocalhostUrl(s)) return stripOriginFromInternalMediaUrl(s);
  return s;
}

export function assertPersistableMediaUrl(input: string): void {
  const s = String(input || '').trim();
  if (!s) throw new Error('URL de mídia vazia.');
  if (s.startsWith('http://') || s.startsWith('https://')) {
    throw new Error('URL absoluta não permitida para persistência. Use path relativo interno assinado.');
  }
  if (isWhatsappCdnUrl(s)) throw new Error('URL de CDN WhatsApp não pode ser persistida.');
  if (isLocalhostUrl(s)) throw new Error('URL localhost não pode ser persistida.');
  if (s.startsWith('/api/chat/avatar-proxy')) throw new Error('URL de avatar-proxy não pode ser persistida.');
  if (!isInternalMediaUrl(s)) {
    throw new Error('URL de mídia deve apontar para endpoint interno assinado.');
  }
}
