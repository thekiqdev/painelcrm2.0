import type { Request, Response } from 'express';
import fs from 'fs/promises';
import { constants as FsConstants } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { exists, readBuffer, resolveAbsolutePath } from './mediaLocalStorageAdapter.js';
import { verifyMediaSignature } from './mediaUrlSigner.js';
import {
  getMediaSigningSecretSource,
  getMediaStorageRoot,
  isMediaAssetsWriteEnabled,
  isMediaAvatarWhatsappEnabled,
  isMediaRawDiagnosticLogsEnabled,
} from './mediaConfig.js';
import { saveFromBuffer } from './mediaService.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { pool } from '../../utils/db.js';

function contentTypeForFile(absPath: string): string {
  const lower = absPath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}

function decodeStorageKeyFromQuery(k: string): string {
  try {
    return Buffer.from(k, 'base64url').toString('utf8');
  } catch {
    throw new Error('Parâmetro k inválido.');
  }
}

function prefixKey(storageKey: string, max = 48): string {
  const t = String(storageKey || '');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function logMediaRawDiagnostic(payload: Record<string, unknown>): void {
  if (!isMediaRawDiagnosticLogsEnabled()) return;
  console.log('[media-raw-request]', JSON.stringify(payload));
}

export async function getMediaRawBySignedKey(req: Request, res: Response): Promise<void> {
  const k = String(req.query.k || '').trim();
  const s = String(req.query.s || '').trim();
  const root = getMediaStorageRoot();
  if (!k || !s) {
    logMediaRawDiagnostic({
      phase: 'missing_params',
      hasK: Boolean(k),
      hasS: Boolean(s),
      storageRoot: root,
    });
    res.status(400).type('text/plain').send('Parâmetros k e s são obrigatórios.');
    return;
  }

  let storageKey = '';
  try {
    storageKey = decodeStorageKeyFromQuery(k);
  } catch (e: unknown) {
    logMediaRawDiagnostic({
      phase: 'invalid_k',
      storageRoot: root,
      error: e instanceof Error ? e.message : 'decode_error',
    });
    res.status(400).type('text/plain').send(e instanceof Error ? e.message : 'Parâmetro k inválido.');
    return;
  }

  const eRaw = String(req.query.e || '').trim();
  let expiresAtUnix: number | null = null;
  if (eRaw) {
    const parsed = parseInt(eRaw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      logMediaRawDiagnostic({
        phase: 'invalid_expiry',
        storageKeyPrefix: prefixKey(storageKey),
        storageRoot: root,
      });
      res.status(400).type('text/plain').send('Parâmetro e inválido.');
      return;
    }
    expiresAtUnix = parsed;
  }

  const sigOk = verifyMediaSignature(storageKey, s, expiresAtUnix);
  if (!sigOk) {
    logMediaRawDiagnostic({
      phase: 'bad_signature',
      storageKeyPrefix: prefixKey(storageKey),
      signatureOk: false,
      signingSecretSource: getMediaSigningSecretSource(),
      storageRoot: root,
      hasExpiry: expiresAtUnix != null,
    });
    res.status(400).type('text/plain').send('Assinatura inválida.');
    return;
  }

  // S32.1 / D32.8 — URL assinada com TTL: após expiry → 410
  if (expiresAtUnix != null && Math.floor(Date.now() / 1000) > expiresAtUnix) {
    logMediaRawDiagnostic({
      phase: 'expired',
      storageKeyPrefix: prefixKey(storageKey),
      signatureOk: true,
      expiresAtUnix,
      storageRoot: root,
    });
    res.status(410).type('text/plain').send('URL de mídia expirada.');
    return;
  }

  // Soft-delete: asset deleted/purged deixa de autorizar leitura
  try {
    const st = await pool.query<{ status: string; deleted_at: string | null }>(
      `SELECT status, deleted_at::text
       FROM public.media_assets
       WHERE storage_key = $1
       LIMIT 1`,
      [storageKey]
    );
    const row = st.rows[0];
    if (row && (row.deleted_at || row.status === 'deleted' || row.status === 'purged')) {
      logMediaRawDiagnostic({
        phase: 'asset_deleted',
        storageKeyPrefix: prefixKey(storageKey),
        signatureOk: true,
        status: row.status,
        storageRoot: root,
      });
      res.status(410).type('text/plain').send('Mídia removida.');
      return;
    }
  } catch {
    // Sem media_assets / falha de BD: segue leitura do disco (compat legado).
  }

  let absPath = '';
  try {
    absPath = resolveAbsolutePath(storageKey);
  } catch {
    logMediaRawDiagnostic({
      phase: 'bad_path',
      storageKeyPrefix: prefixKey(storageKey),
      signatureOk: true,
      storageRoot: root,
    });
    res.status(400).type('text/plain').send('Caminho inválido.');
    return;
  }

  let fileExists = false;
  try {
    fileExists = await exists(storageKey);
  } catch {
    fileExists = false;
  }

  try {
    const buf = await readBuffer(storageKey);
    logMediaRawDiagnostic({
      phase: 'read_ok',
      storageKeyPrefix: prefixKey(storageKey),
      signatureOk: true,
      storageRoot: root,
      absolutePathExists: fileExists,
      contentType: contentTypeForFile(absPath),
      sizeBytes: buf.length,
    });
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(contentTypeForFile(absPath));
    res.send(buf);
  } catch (err: unknown) {
    logMediaRawDiagnostic({
      phase: 'read_fail',
      storageKeyPrefix: prefixKey(storageKey),
      signatureOk: true,
      storageRoot: root,
      absolutePathExists: fileExists,
      absolutePathPrefix: prefixKey(absPath, 80),
      error: err instanceof Error ? err.message : 'read_error',
    });
    res.status(404).type('text/plain').send('Ficheiro não encontrado.');
  }
}

export async function postSuperadminMediaTestSaveBuffer(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = String(req.userId || '').trim();
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const tenantId = String(req.body?.tenantId || 'superadmin').trim();
    const writeAssetRecord = req.body?.writeAssetRecord === true;
    const payload = Buffer.from(`media-test:${new Date().toISOString()}:${Math.random()}`, 'utf8');
    const saved = await saveFromBuffer({
      tenantId,
      ownerType: 'unassigned',
      ownerId: null,
      scope: 'contract_document',
      buffer: payload,
      mimeType: 'text/plain',
      originalFilename: 'media-test.txt',
      metadata: { createdBy: userId, via: 'superadmin_test_endpoint' },
      writeAssetRecord,
    });

    res.json({
      storageKey: saved.storageKey,
      relativeUrl: saved.relativeUrl,
      checksum: saved.checksum,
      sizeBytes: saved.sizeBytes,
      mimeType: saved.mimeType,
      pathBasename: path.basename(saved.storageKey),
      payloadSha256: createHash('sha256').update(payload).digest('hex'),
      writeAssetRecord,
      resolvedMediaStorageRoot: getMediaStorageRoot(),
      processCwd: process.cwd(),
      signingSecretSource: getMediaSigningSecretSource(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao testar media save buffer.';
    res.status(500).json({ error: msg });
  }
}

/** GET Super Admin — diagnóstico de storage (sem segredos). */
export async function getSuperadminMediaStorageDiagnostics(req: AuthRequest, res: Response): Promise<void> {
  try {
    const root = getMediaStorageRoot();
    let rootReadable = false;
    let rootWritable = false;
    try {
      await fs.access(root, FsConstants.R_OK);
      rootReadable = true;
    } catch {
      rootReadable = false;
    }
    try {
      await fs.access(root, FsConstants.W_OK);
      rootWritable = true;
    } catch {
      rootWritable = false;
    }

    res.json({
      ok: true,
      nodeEnv: process.env.NODE_ENV ?? null,
      processCwd: process.cwd(),
      resolvedMediaStorageRoot: root,
      envMediaStorageRootRaw: process.env.MEDIA_STORAGE_ROOT?.trim() || null,
      signingSecretSource: getMediaSigningSecretSource(),
      mediaAvatarWhatsappEnabled: isMediaAvatarWhatsappEnabled(),
      mediaAssetsWriteEnabled: isMediaAssetsWriteEnabled(),
      storageRootReadable: rootReadable,
      storageRootWritable: rootWritable,
      note:
        'URLs antigas podem ter sido assinadas com outro segredo; use test-save-buffer + GET relativeUrl para validar o pipeline atual.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao ler diagnóstico de media.';
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function listSuperadminRecentMediaAssets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limitRaw = parseInt(String(req.query.limit || '20'), 10);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));
    const rows = await pool.query(
      `SELECT
         id::text,
         tenant_id::text,
         owner_type,
         owner_id::text,
         scope,
         storage_key,
         mime_type,
         size_bytes,
         checksum,
         original_filename,
         source_url,
         public_url,
         status,
         metadata,
         created_by::text,
         created_at::text,
         updated_at::text
       FROM public.media_assets
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, items: rows.rows });
  } catch (e: unknown) {
    console.error('[media-assets] list recent', e);
    const msg = e instanceof Error ? e.message : 'Erro ao listar media_assets.';
    res.status(500).json({ ok: false, error: msg });
  }
}
