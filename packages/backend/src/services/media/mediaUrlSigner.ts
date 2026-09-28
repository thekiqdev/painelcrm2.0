import { createHmac, timingSafeEqual } from 'crypto';
import { getMediaSigningSecret } from './mediaConfig.js';

export const MEDIA_RAW_SIGNED_PATH = '/api/media/v1/raw';

function storageKeyToK(storageKey: string): string {
  return Buffer.from(storageKey, 'utf8').toString('base64url');
}

function signPayload(payload: string): string {
  return createHmac('sha256', getMediaSigningSecret()).update(payload).digest('base64url');
}

/**
 * Assina storageKey. Com `expiresAtUnix`, o HMAC cobre `k.e` (TTL na URL — S32.1 / D32.8).
 * Sem expiry: payload = k (compat legado).
 */
export function signMediaStorageKey(storageKey: string, expiresAtUnix?: number): string {
  const k = storageKeyToK(storageKey);
  if (expiresAtUnix != null && Number.isFinite(expiresAtUnix)) {
    return signPayload(`${k}.${Math.floor(expiresAtUnix)}`);
  }
  return signPayload(k);
}

export function verifyMediaSignature(
  storageKey: string,
  signature: string,
  expiresAtUnix?: number | null
): boolean {
  const expected = signMediaStorageKey(
    storageKey,
    expiresAtUnix != null && Number.isFinite(expiresAtUnix) ? Math.floor(expiresAtUnix) : undefined
  );
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildMediaRawSignedRelativeUrl(
  storageKey: string,
  opts?: { expiresAtUnix?: number }
): string {
  const k = storageKeyToK(storageKey);
  const expiresAtUnix =
    opts?.expiresAtUnix != null && Number.isFinite(opts.expiresAtUnix)
      ? Math.floor(opts.expiresAtUnix)
      : undefined;
  const s = signMediaStorageKey(storageKey, expiresAtUnix);
  const params = new URLSearchParams({ k, s });
  if (expiresAtUnix != null) params.set('e', String(expiresAtUnix));
  return `${MEDIA_RAW_SIGNED_PATH}?${params.toString()}`;
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
