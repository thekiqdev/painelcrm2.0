import path from 'path';
import fs from 'fs/promises';
import {
  buildWhatsappTemplateMediaPublicUrlFromStoragePath,
  getWhatsappTemplateMediaRootCandidates,
  getWhatsappTemplateMediaRoot,
} from './whatsappTemplateMediaStorageService.js';
import { readBuffer } from './media/mediaLocalStorageAdapter.js';
import {
  extractMediaStorageKeyFromStoredUrl,
  buildMediaRawSignedRelativeUrl,
} from './media/mediaUrlSigner.js';
import { getMediaAssetForOutgoingSend } from './media/mediaLibraryService.js';
import { pool } from '../utils/db.js';

type OutgoingMediaType = 'image' | 'document' | 'audio';

type ResolveOutgoingMediaPayloadParams = {
  type: OutgoingMediaType;
  fileUrl?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  /** S33.1 — asset da Media Library (scopes library / product_image). */
  assetId?: string | null;
  tenantId?: string | null;
};

type ResolvedOutgoingMediaPayload = {
  fileForProvider: string;
  mimeType: string;
  persistedUrl: string;
  strategy: 'data_uri' | 'public_url';
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function defaultMime(type: OutgoingMediaType): string {
  if (type === 'document') return 'application/pdf';
  if (type === 'audio') return 'audio/mpeg';
  return 'image/jpeg';
}

function isPrivateIpv4(host: string): boolean {
  const p = host.split('.').map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  if (p[0] === 10) return true;
  if (p[0] === 127) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  return false;
}

function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = (u.hostname || '').toLowerCase();
    if (!host) return false;
    if (LOCAL_HOSTS.has(host)) return false;
    if (isPrivateIpv4(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function storageAbsPathFromRelative(storagePath: string): string {
  const root = path.resolve(getWhatsappTemplateMediaRoot());
  const abs = path.resolve(path.join(root, storagePath));
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error('storage_path inválido.');
  }
  return abs;
}

function storagePathFromKnownMediaUrl(fileUrl: string): string | null {
  try {
    const u = new URL(fileUrl);
    const marker = '/media/whatsapp-templates/';
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    const tail = u.pathname.slice(idx + marker.length);
    if (!tail) return null;
    return tail
      .split('/')
      .filter(Boolean)
      .map((seg) => decodeURIComponent(seg))
      .join('/');
  } catch {
    return null;
  }
}

async function readStorageAsDataUri(storagePath: string, mime: string): Promise<string> {
  const candidates = getWhatsappTemplateMediaRootCandidates();
  let lastErr: unknown = null;
  for (const rootCandidate of candidates) {
    try {
      const root = path.resolve(rootCandidate);
      const abs = path.resolve(path.join(root, storagePath));
      if (!abs.startsWith(root + path.sep) && abs !== root) continue;
      const bin = await fs.readFile(abs);
      return `data:${mime};base64,${bin.toString('base64')}`;
    } catch (e) {
      lastErr = e;
    }
  }
  const abs = storageAbsPathFromRelative(storagePath);
  const bin = await fs.readFile(abs).catch(() => {
    throw lastErr || new Error('storage_media_not_found');
  });
  return `data:${mime};base64,${bin.toString('base64')}`;
}

/** Soft-delete / purged em media_assets bloqueia leitura para envio. */
async function assertMediaAssetReadableByStorageKey(storageKey: string): Promise<void> {
  try {
    const st = await pool.query<{ status: string; deleted_at: string | null }>(
      `SELECT status, deleted_at::text
       FROM public.media_assets
       WHERE storage_key = $1
       LIMIT 1`,
      [storageKey],
    );
    const row = st.rows[0];
    if (row && (row.deleted_at || row.status === 'deleted' || row.status === 'purged')) {
      throw new Error('media_asset_deleted');
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'media_asset_deleted') throw e;
    // Sem linha / falha BD: segue (compat legado disco).
  }
}

async function readMediaV1StorageAsDataUri(storageKey: string, mime: string): Promise<string> {
  await assertMediaAssetReadableByStorageKey(storageKey);
  const bin = await readBuffer(storageKey);
  return `data:${mime};base64,${bin.toString('base64')}`;
}

/**
 * Resolve payload de mídia outbound para UazAPI.
 * Ordem: assetId (Media Library) → storagePath template → data URI → media v1 raw → template URL → HTTP público.
 */
export async function resolveOutgoingMediaPayload(
  params: ResolveOutgoingMediaPayloadParams,
): Promise<ResolvedOutgoingMediaPayload> {
  const mime = (params.mimeType ?? '').trim() || defaultMime(params.type);
  const rawUrl = (params.fileUrl ?? '').trim();
  const storagePath = (params.storagePath ?? '').trim();
  const assetId = (params.assetId ?? '').trim();
  const tenantId = (params.tenantId ?? '').trim();

  if (assetId) {
    if (!tenantId) throw new Error('tenantId_required_for_assetId');
    const asset = await getMediaAssetForOutgoingSend({ tenantId, assetId });
    if (!asset) throw new Error('media_asset_not_found');
    const dataUri = await readMediaV1StorageAsDataUri(asset.storageKey, asset.mimeType || mime);
    return {
      fileForProvider: dataUri,
      mimeType: asset.mimeType || mime,
      persistedUrl: asset.relativeUrl || buildMediaRawSignedRelativeUrl(asset.storageKey),
      strategy: 'data_uri',
    };
  }

  if (storagePath) {
    const dataUri = await readStorageAsDataUri(storagePath, mime);
    return {
      fileForProvider: dataUri,
      mimeType: mime,
      persistedUrl: rawUrl || buildWhatsappTemplateMediaPublicUrlFromStoragePath(storagePath),
      strategy: 'data_uri',
    };
  }

  if (rawUrl.startsWith('data:')) {
    return {
      fileForProvider: rawUrl,
      mimeType: mime,
      persistedUrl: rawUrl,
      strategy: 'data_uri',
    };
  }

  if (rawUrl) {
    const mediaV1Key = extractMediaStorageKeyFromStoredUrl(rawUrl);
    if (mediaV1Key) {
      const dataUri = await readMediaV1StorageAsDataUri(mediaV1Key, mime);
      return {
        fileForProvider: dataUri,
        mimeType: mime,
        persistedUrl: rawUrl.startsWith('/') ? rawUrl : buildMediaRawSignedRelativeUrl(mediaV1Key),
        strategy: 'data_uri',
      };
    }

    const inferredStoragePath = storagePathFromKnownMediaUrl(rawUrl);
    if (inferredStoragePath) {
      const dataUri = await readStorageAsDataUri(inferredStoragePath, mime);
      return {
        fileForProvider: dataUri,
        mimeType: mime,
        persistedUrl: rawUrl,
        strategy: 'data_uri',
      };
    }

    if (isPublicHttpUrl(rawUrl)) {
      return {
        fileForProvider: rawUrl,
        mimeType: mime,
        persistedUrl: rawUrl,
        strategy: 'public_url',
      };
    }
    throw new Error('media_url_non_public_or_unreachable');
  }

  throw new Error('missing_media_source');
}
