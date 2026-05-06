import { createHash } from 'crypto';
import { getMediaMaxFileBytes, isMediaAssetsWriteEnabled } from './mediaConfig.js';
import { saveBuffer as saveBufferLocal } from './mediaLocalStorageAdapter.js';
import { buildMediaStorageKey } from './mediaStorageKey.js';
import type { SaveMediaFromBufferInput, SaveMediaResult, MediaOwnerType, MediaScope } from './mediaTypes.js';
import { assertPersistableMediaUrl } from './mediaGuards.js';
import { buildMediaRawSignedRelativeUrl } from './mediaUrlSigner.js';
import { pool } from '../../utils/db.js';

const ACCEPTED_MIME_PREFIX = ['image/', 'application/pdf', 'text/plain'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bufferLooksLikeImage(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return true;
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  )
    return true;
  return false;
}

/** Inferência mínima quando o upstream manda `octet-stream` ou content-type vazio (ex.: CDN WhatsApp). */
function inferImageMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

function assertAllowedMimeType(mimeType: string): void {
  const mt = String(mimeType || '').toLowerCase().trim();
  if (!mt) throw new Error('mimeType obrigatório.');
  const ok = ACCEPTED_MIME_PREFIX.some((x) => (x.endsWith('/') ? mt.startsWith(x) : mt === x));
  if (!ok) throw new Error(`mimeType não permitido: ${mimeType}`);
}

function assertInputTenantId(tenantId: string): void {
  const t = String(tenantId || '').trim();
  if (!t) throw new Error('tenantId obrigatório.');
  if (t.includes('..') || t.includes('/') || t.includes('\\')) {
    throw new Error('tenantId inválido.');
  }
}

function asUuidOrNull(input: string | null | undefined): string | null {
  const s = String(input || '').trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

async function registerMediaAsset(input: {
  tenantId: string;
  ownerType: MediaOwnerType;
  ownerId?: string | null;
  scope: MediaScope;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  originalFilename?: string | null;
  sourceUrl?: string | null;
  publicUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const tenantId = asUuidOrNull(input.tenantId);
  if (!tenantId) return;
  const ownerId = asUuidOrNull(input.ownerId ?? null);
  try {
    await pool.query(
      `INSERT INTO public.media_assets (
        tenant_id, owner_type, owner_id, scope, storage_key, mime_type, size_bytes, checksum,
        original_filename, source_url, public_url, status, metadata
      ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, 'ready', $12::jsonb)
      ON CONFLICT (storage_key) DO NOTHING`,
      [
        tenantId,
        input.ownerType,
        ownerId,
        input.scope,
        input.storageKey,
        input.mimeType,
        input.sizeBytes,
        input.checksum,
        input.originalFilename ?? null,
        input.sourceUrl ?? null,
        input.publicUrl,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
  } catch (e: unknown) {
    console.warn('[mediaService] registerMediaAsset skipped:', e instanceof Error ? e.message : e);
  }
}

export async function saveFromBuffer(input: SaveMediaFromBufferInput): Promise<SaveMediaResult> {
  assertInputTenantId(input.tenantId);
  assertAllowedMimeType(input.mimeType);
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new Error('buffer inválido.');
  }
  const max = getMediaMaxFileBytes();
  if (input.buffer.length > max) {
    throw new Error(`Arquivo excede o limite de ${max} bytes.`);
  }

  const storageKey = buildMediaStorageKey({
    tenantId: input.tenantId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    scope: input.scope,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename,
  });

  await saveBufferLocal(storageKey, input.buffer);
  const checksum = createHash('sha256').update(input.buffer).digest('hex');
  const relativeUrl = buildMediaRawSignedRelativeUrl(storageKey);
  assertPersistableMediaUrl(relativeUrl);
  const shouldWriteAssetRecord = isMediaAssetsWriteEnabled() || input.writeAssetRecord === true;
  if (shouldWriteAssetRecord) {
    await registerMediaAsset({
      tenantId: input.tenantId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      scope: input.scope,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      checksum,
      originalFilename: input.originalFilename,
      sourceUrl: input.sourceUrl,
      publicUrl: relativeUrl,
      metadata: input.metadata,
    });
  }

  return {
    storageKey,
    relativeUrl,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    checksum,
  };
}

export function getSignedReadPath(storageKey: string): string {
  const url = buildMediaRawSignedRelativeUrl(storageKey);
  assertPersistableMediaUrl(url);
  return url;
}

export async function cacheRemoteUrl(input: {
  tenantId: string;
  ownerType: MediaOwnerType;
  ownerId?: string | null;
  scope: MediaScope;
  sourceUrl: string;
  existingStorageKey?: string | null;
  metadata?: Record<string, unknown>;
  /** Mescla com o fetch (ex.: headers para CDN que exige User-Agent / Referer). */
  fetchInit?: RequestInit;
  /** Segunda tentativa se a primeira resposta for 401/403 (ex.: headers reduzidos). */
  fallbackFetchInit?: RequestInit;
  /** Força gravação em media_assets mesmo com MEDIA_ASSETS_WRITE_ENABLED desligado. */
  writeAssetRecord?: boolean;
}): Promise<{
  ok: boolean;
  storageKey?: string;
  relativeUrl?: string;
  checksum?: string;
  reason?: string;
}> {
  try {
    const sourceUrl = String(input.sourceUrl || '').trim();
    if (!/^https?:\/\//i.test(sourceUrl)) {
      return { ok: false, reason: 'source_url_invalid' };
    }

    const max = getMediaMaxFileBytes();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    let res: Response;
    try {
      const primaryInit: RequestInit = { ...(input.fetchInit || {}), signal: ctrl.signal };
      res = await fetch(sourceUrl, primaryInit);
      if (
        !res.ok &&
        (res.status === 403 || res.status === 401) &&
        input.fallbackFetchInit &&
        Object.keys(input.fallbackFetchInit).length > 0
      ) {
        const fb: RequestInit = { ...input.fallbackFetchInit, signal: ctrl.signal };
        res = await fetch(sourceUrl, fb);
      }
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) return { ok: false, reason: `remote_http_${res.status}` };
    let mimeType = String(res.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const contentLength = parseInt(String(res.headers.get('content-length') || '0'), 10);
    if (Number.isFinite(contentLength) && contentLength > max) {
      return { ok: false, reason: 'remote_too_large' };
    }

    const raw = Buffer.from(await res.arrayBuffer());
    if (!raw.length) return { ok: false, reason: 'remote_empty' };
    if (raw.length > max) return { ok: false, reason: 'remote_too_large' };

    if (!mimeType || mimeType === 'application/octet-stream') {
      const inferred = inferImageMimeFromBuffer(raw);
      if (inferred) mimeType = inferred;
    }
    if (mimeType === 'image/*' && bufferLooksLikeImage(raw)) {
      mimeType = 'image/jpeg';
    }
    try {
      assertAllowedMimeType(mimeType);
    } catch {
      return { ok: false, reason: 'remote_bad_mime' };
    }

    const saved = await saveFromBuffer({
      tenantId: input.tenantId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      scope: input.scope,
      buffer: raw,
      mimeType,
      originalFilename: null,
      sourceUrl: sourceUrl,
      metadata: input.metadata,
      writeAssetRecord: input.writeAssetRecord,
    });

    return {
      ok: true,
      storageKey: saved.storageKey,
      relativeUrl: saved.relativeUrl,
      checksum: saved.checksum,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : 'cache_remote_failed',
    };
  }
}
