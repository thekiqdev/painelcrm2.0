import { createHmac, timingSafeEqual } from 'crypto';
import { getMediaSigningSecret } from './mediaConfig.js';

export const MEDIA_RAW_SIGNED_PATH = '/api/media/v1/raw';

export function signMediaStorageKey(storageKey: string): string {
  const k = Buffer.from(storageKey, 'utf8').toString('base64url');
  return createHmac('sha256', getMediaSigningSecret()).update(k).digest('base64url');
}

export function verifyMediaSignature(storageKey: string, signature: string): boolean {
  const k = Buffer.from(storageKey, 'utf8').toString('base64url');
  const expected = createHmac('sha256', getMediaSigningSecret()).update(k).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildMediaRawSignedRelativeUrl(storageKey: string): string {
  const k = Buffer.from(storageKey, 'utf8').toString('base64url');
  const s = signMediaStorageKey(storageKey);
  const qs = new URLSearchParams({ k, s }).toString();
  return `${MEDIA_RAW_SIGNED_PATH}?${qs}`;
}

/**
 * Extrai storageKey de URLs `/api/media/v1/raw?...` ou de uma chave já em formato
 * `tenants/.../scope/...` (sem segmento `users/` como no catalog antigo).
 */
export function extractMediaStorageKeyFromStoredUrl(stored: string): string | null {
  const t = String(stored || '').trim();
  if (!t) return null;
  if (t.startsWith('tenants/') && !t.includes('/users/')) {
    const parts = t.split('/').filter(Boolean);
    if (parts.length >= 6 && parts[0] === 'tenants') return t;
    return null;
  }
  try {
    const u = new URL(t, 'https://placeholder.local');
    if (!u.pathname.includes(MEDIA_RAW_SIGNED_PATH)) return null;
    const k = u.searchParams.get('k');
    if (!k) return null;
    try {
      return Buffer.from(k, 'base64url').toString('utf8');
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
