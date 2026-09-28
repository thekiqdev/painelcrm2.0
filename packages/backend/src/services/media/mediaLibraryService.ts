/**
 * S33 — Media Library tenant: listagem, upload, soft delete e quotas.
 * Scopes de library/produtos ≠ `flow_inbound_temp` (D32.2).
 */
import {
  getMediaLibraryMaxCount,
  getMediaLibraryMaxFileBytes,
  getMediaLibraryMaxTotalBytes,
} from './mediaConfig.js';
import { saveFromBuffer } from './mediaService.js';
import { buildMediaRawSignedRelativeUrl } from './mediaUrlSigner.js';
import type { MediaScope } from './mediaTypes.js';
import { pool } from '../../utils/db.js';

/** Scopes visíveis na Media Library (nunca inclui flow_inbound_temp). */
export const MEDIA_LIBRARY_SCOPES: readonly MediaScope[] = ['library', 'product_image'] as const;

const FLOW_INBOUND_SCOPE = 'flow_inbound_temp';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MediaLibraryQuota = {
  usedCount: number;
  usedBytes: number;
  maxCount: number;
  maxTotalBytes: number;
  remainingCount: number;
  remainingBytes: number;
};

export type MediaLibraryAsset = {
  id: string;
  tenantId: string;
  scope: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  originalFilename: string | null;
  status: string;
  relativeUrl: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export class MediaLibraryQuotaError extends Error {
  readonly code = 'MEDIA_LIBRARY_QUOTA_EXCEEDED' as const;
  constructor(
    message: string,
    readonly details: { usedCount: number; usedBytes: number; maxCount: number; maxTotalBytes: number }
  ) {
    super(message);
    this.name = 'MediaLibraryQuotaError';
  }
}

export function isMediaLibraryScope(scope: string): boolean {
  const s = String(scope || '').trim();
  return (MEDIA_LIBRARY_SCOPES as readonly string[]).includes(s);
}

/** D32.2 — inbound temp nunca entra na library. */
export function isExcludedFromMediaLibrary(scope: string): boolean {
  return String(scope || '').trim() === FLOW_INBOUND_SCOPE;
}

export function assertMediaLibraryMimeAllowed(mimeType: string): void {
  const mt = String(mimeType || '').toLowerCase().trim();
  if (!mt) throw new Error('mimeType obrigatório.');
  const ok =
    mt.startsWith('image/') ||
    mt.startsWith('audio/') ||
    mt.startsWith('video/') ||
    mt === 'application/pdf' ||
    mt === 'application/msword' ||
    mt.startsWith('application/vnd.openxmlformats-officedocument') ||
    mt === 'application/vnd.ms-excel' ||
    mt === 'text/plain';
  if (!ok) throw new Error(`Tipo de ficheiro não permitido na Media Library: ${mimeType}`);
}

export async function getMediaLibraryQuota(tenantId: string): Promise<MediaLibraryQuota> {
  const tid = String(tenantId || '').trim();
  if (!UUID_RE.test(tid)) throw new Error('tenantId inválido.');

  const maxCount = getMediaLibraryMaxCount();
  const maxTotalBytes = getMediaLibraryMaxTotalBytes();
  const r = await pool.query<{ cnt: string; bytes: string }>(
    `SELECT
       COUNT(*)::text AS cnt,
       COALESCE(SUM(size_bytes), 0)::text AS bytes
     FROM public.media_assets
     WHERE tenant_id = $1::uuid
       AND deleted_at IS NULL
       AND status NOT IN ('deleted', 'purged')
       AND scope = ANY($2::text[])`,
    [tid, [...MEDIA_LIBRARY_SCOPES]]
  );
  const usedCount = parseInt(r.rows[0]?.cnt || '0', 10) || 0;
  const usedBytes = parseInt(r.rows[0]?.bytes || '0', 10) || 0;
  return {
    usedCount,
    usedBytes,
    maxCount,
    maxTotalBytes,
    remainingCount: Math.max(0, maxCount - usedCount),
    remainingBytes: Math.max(0, maxTotalBytes - usedBytes),
  };
}

export async function assertMediaLibraryQuotaAllows(
  tenantId: string,
  incomingBytes: number
): Promise<MediaLibraryQuota> {
  const quota = await getMediaLibraryQuota(tenantId);
  const bytes = Math.max(0, Math.floor(incomingBytes));
  if (quota.usedCount + 1 > quota.maxCount) {
    throw new MediaLibraryQuotaError(
      `Quota da Media Library excedida: limite de ${quota.maxCount} ficheiros por tenant.`,
      {
        usedCount: quota.usedCount,
        usedBytes: quota.usedBytes,
        maxCount: quota.maxCount,
        maxTotalBytes: quota.maxTotalBytes,
      }
    );
  }
  if (quota.usedBytes + bytes > quota.maxTotalBytes) {
    throw new MediaLibraryQuotaError(
      `Quota da Media Library excedida: limite de ${quota.maxTotalBytes} bytes por tenant.`,
      {
        usedCount: quota.usedCount,
        usedBytes: quota.usedBytes,
        maxCount: quota.maxCount,
        maxTotalBytes: quota.maxTotalBytes,
      }
    );
  }
  return quota;
}

function mapRow(row: {
  id: string;
  tenant_id: string;
  scope: string;
  storage_key: string;
  mime_type: string;
  size_bytes: string | number;
  checksum: string | null;
  original_filename: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): MediaLibraryAsset {
  const storageKey = row.storage_key;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    scope: row.scope,
    storageKey,
    mimeType: row.mime_type,
    sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : parseInt(String(row.size_bytes), 10) || 0,
    checksum: row.checksum,
    originalFilename: row.original_filename,
    status: row.status,
    relativeUrl: buildMediaRawSignedRelativeUrl(storageKey),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMediaLibraryAssets(input: {
  tenantId: string;
  limit?: number;
  offset?: number;
  q?: string | null;
}): Promise<{ items: MediaLibraryAsset[]; total: number; quota: MediaLibraryQuota }> {
  const tid = String(input.tenantId || '').trim();
  if (!UUID_RE.test(tid)) throw new Error('tenantId inválido.');

  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const q = String(input.q || '').trim();

  const params: unknown[] = [tid, [...MEDIA_LIBRARY_SCOPES]];
  let whereExtra = '';
  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`);
    whereExtra = ` AND (
      COALESCE(original_filename, '') ILIKE $${params.length}
      OR COALESCE(mime_type, '') ILIKE $${params.length}
      OR storage_key ILIKE $${params.length}
    )`;
  }

  const countR = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM public.media_assets
     WHERE tenant_id = $1::uuid
       AND deleted_at IS NULL
       AND status NOT IN ('deleted', 'purged')
       AND scope = ANY($2::text[])
       ${whereExtra}`,
    params
  );
  const total = parseInt(countR.rows[0]?.total || '0', 10) || 0;

  params.push(limit, offset);
  const listR = await pool.query({
    text: `SELECT
       id::text,
       tenant_id::text,
       scope,
       storage_key,
       mime_type,
       size_bytes,
       checksum,
       original_filename,
       status,
       created_by::text,
       created_at::text,
       updated_at::text
     FROM public.media_assets
     WHERE tenant_id = $1::uuid
       AND deleted_at IS NULL
       AND status NOT IN ('deleted', 'purged')
       AND scope = ANY($2::text[])
       ${whereExtra}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    values: params,
  });

  const quota = await getMediaLibraryQuota(tid);
  return {
    items: listR.rows.map(mapRow),
    total,
    quota,
  };
}

/**
 * S33.1 — carrega asset pronto do tenant para envio WhatsApp / associação.
 * Não devolve `flow_inbound_temp` (D32.2 — inbound do bot ≠ library).
 */
export async function getMediaAssetForOutgoingSend(input: {
  tenantId: string;
  assetId: string;
}): Promise<MediaLibraryAsset | null> {
  const tid = String(input.tenantId || '').trim();
  const aid = String(input.assetId || '').trim();
  if (!UUID_RE.test(tid) || !UUID_RE.test(aid)) return null;

  const row = await pool.query({
    text: `SELECT
       id::text,
       tenant_id::text,
       scope,
       storage_key,
       mime_type,
       size_bytes,
       checksum,
       original_filename,
       status,
       created_by::text,
       created_at::text,
       updated_at::text
     FROM public.media_assets
     WHERE id = $1::uuid
       AND tenant_id = $2::uuid
       AND deleted_at IS NULL
       AND status NOT IN ('deleted', 'purged')
       AND scope = ANY($3::text[])
     LIMIT 1`,
    values: [aid, tid, [...MEDIA_LIBRARY_SCOPES]],
  });
  const r = row.rows[0];
  return r ? mapRow(r) : null;
}

export async function uploadMediaLibraryAsset(input: {
  tenantId: string;
  userId: string;
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string | null;
}): Promise<MediaLibraryAsset> {
  const tid = String(input.tenantId || '').trim();
  if (!UUID_RE.test(tid)) throw new Error('tenantId inválido.');
  assertMediaLibraryMimeAllowed(input.mimeType);

  const maxFile = getMediaLibraryMaxFileBytes();
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new Error('Arquivo obrigatório.');
  }
  if (input.buffer.length > maxFile) {
    throw new Error(`Arquivo excede o limite de ${maxFile} bytes.`);
  }

  await assertMediaLibraryQuotaAllows(tid, input.buffer.length);

  const saved = await saveFromBuffer({
    tenantId: tid,
    ownerType: 'tenant',
    ownerId: tid,
    scope: 'library',
    buffer: input.buffer,
    mimeType: input.mimeType,
    originalFilename: input.originalFilename || null,
    writeAssetRecord: true,
    maxBytes: maxFile,
    createdBy: input.userId,
    metadata: {
      purpose: 'media_library',
      library: true,
    },
  });

  if (!saved.assetId) {
    throw new Error('Falha ao registar asset na Media Library.');
  }

  const row = await pool.query({
    text: `SELECT
       id::text,
       tenant_id::text,
       scope,
       storage_key,
       mime_type,
       size_bytes,
       checksum,
       original_filename,
       status,
       created_by::text,
       created_at::text,
       updated_at::text
     FROM public.media_assets
     WHERE id = $1::uuid AND tenant_id = $2::uuid
     LIMIT 1`,
    values: [saved.assetId, tid],
  });
  const mapped = row.rows[0] ? mapRow(row.rows[0]) : null;
  if (!mapped) {
    return {
      id: saved.assetId,
      tenantId: tid,
      scope: 'library',
      storageKey: saved.storageKey,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      checksum: saved.checksum,
      originalFilename: input.originalFilename || null,
      status: 'ready',
      relativeUrl: saved.relativeUrl,
      createdBy: input.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  return mapped;
}

export async function softDeleteMediaLibraryAsset(input: {
  tenantId: string;
  assetId: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const tid = String(input.tenantId || '').trim();
  const assetId = String(input.assetId || '').trim();
  if (!UUID_RE.test(tid) || !UUID_RE.test(assetId)) {
    return { ok: false, reason: 'ids_invalidos' };
  }

  const r = await pool.query<{ id: string; scope: string }>(
    `UPDATE public.media_assets
     SET status = 'deleted',
         deleted_at = now(),
         updated_at = now()
     WHERE id = $1::uuid
       AND tenant_id = $2::uuid
       AND deleted_at IS NULL
       AND scope = ANY($3::text[])
     RETURNING id::text, scope`,
    [assetId, tid, [...MEDIA_LIBRARY_SCOPES]]
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (isExcludedFromMediaLibrary(row.scope)) {
    return { ok: false, reason: 'scope_forbidden' };
  }
  return { ok: true, id: row.id };
}
