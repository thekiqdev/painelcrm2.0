/**
 * Detecção de URLs /api/media/v1/raw persistidas mas inválidas (assinatura ou ficheiro).
 */

import { exists } from './media/mediaLocalStorageAdapter.js';
import {
  extractMediaStorageKeyFromStoredUrl,
  verifyMediaSignature,
} from './media/mediaUrlSigner.js';

export type MediaRawHealth = {
  is_media_raw: boolean;
  signature_ok: boolean;
  file_exists: boolean;
};

export async function checkMediaV1RawUrlHealth(
  stored: string | null | undefined,
): Promise<MediaRawHealth | null> {
  const t = typeof stored === 'string' ? stored.trim() : '';
  if (!t || !t.includes('/api/media/v1/raw')) return null;

  const storageKey = extractMediaStorageKeyFromStoredUrl(t);
  if (!storageKey) {
    return { is_media_raw: true, signature_ok: false, file_exists: false };
  }

  let sig = '';
  try {
    sig = new URL(t, 'https://placeholder.local').searchParams.get('s') || '';
  } catch {
    sig = '';
  }
  const signature_ok = sig ? verifyMediaSignature(storageKey, sig) : false;
  const file_exists = await exists(storageKey);
  return { is_media_raw: true, signature_ok, file_exists };
}

export type BrokenInternalMotive =
  | 'media_raw_signature_invalid'
  | 'media_raw_file_missing'
  | 'media_raw_signature_invalid_and_file_missing'
  | 'cache_status_ok_but_blob_missing'
  | 'cache_status_ok_but_signature_invalid'
  | 'cache_status_ok_but_signature_invalid_and_file_missing';

function motiveFromHealth(h: MediaRawHealth): BrokenInternalMotive {
  if (!h.signature_ok && !h.file_exists) return 'media_raw_signature_invalid_and_file_missing';
  if (!h.signature_ok) return 'media_raw_signature_invalid';
  if (!h.file_exists) return 'media_raw_file_missing';
  return 'media_raw_signature_invalid_and_file_missing';
}

function okButMotive(
  statusOk: boolean,
  h: MediaRawHealth,
  base: BrokenInternalMotive,
): BrokenInternalMotive {
  if (!statusOk) return base;
  if (base === 'media_raw_file_missing') return 'cache_status_ok_but_blob_missing';
  if (base === 'media_raw_signature_invalid') return 'cache_status_ok_but_signature_invalid';
  return 'cache_status_ok_but_signature_invalid_and_file_missing';
}

/** Agrega o pior caso entre avatar_url e avatar_cached_url (media raw). */
export async function analyzeBrokenInternalMediaRaw(
  row: {
    avatar_url: string | null;
    avatar_cached_url: string | null;
    avatar_cache_status: string | null;
  },
): Promise<{
  broken: boolean;
  motives: BrokenInternalMotive[];
  health_avatar_url: MediaRawHealth | null;
  health_cached_url: MediaRawHealth | null;
}> {
  const [ha, hc] = await Promise.all([
    checkMediaV1RawUrlHealth(row.avatar_url),
    checkMediaV1RawUrlHealth(row.avatar_cached_url),
  ]);

  const statusOk = String(row.avatar_cache_status || '').trim().toLowerCase() === 'ok';
  const motives: BrokenInternalMotive[] = [];

  const consider = (h: MediaRawHealth | null) => {
    if (!h) return;
    if (h.signature_ok && h.file_exists) return;
    const base = motiveFromHealth(h);
    motives.push(okButMotive(statusOk, h, base));
  };

  consider(ha);
  consider(hc);

  const uniq = [...new Set(motives)];
  const broken = uniq.length > 0;

  return {
    broken,
    motives: uniq,
    health_avatar_url: ha,
    health_cached_url: hc,
  };
}

export function hasStableInternalCacheRow(avatarCachedUrl: string | null | undefined): boolean {
  const c = typeof avatarCachedUrl === 'string' ? avatarCachedUrl.trim() : '';
  if (!c) return false;
  return (
    c.includes('/api/public/catalog-media/raw') ||
    c.includes('/api/media/v1/raw') ||
    c.includes('/media/catalog/')
  );
}
