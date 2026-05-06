import type { Request, Response } from 'express';
import path from 'path';
import { createHash } from 'crypto';
import { readBuffer, resolveAbsolutePath } from './mediaLocalStorageAdapter.js';
import { verifyMediaSignature } from './mediaUrlSigner.js';
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
  return 'application/octet-stream';
}

function decodeStorageKeyFromQuery(k: string): string {
  try {
    return Buffer.from(k, 'base64url').toString('utf8');
  } catch {
    throw new Error('Parâmetro k inválido.');
  }
}

export async function getMediaRawBySignedKey(req: Request, res: Response): Promise<void> {
  const k = String(req.query.k || '').trim();
  const s = String(req.query.s || '').trim();
  if (!k || !s) {
    res.status(400).type('text/plain').send('Parâmetros k e s são obrigatórios.');
    return;
  }

  let storageKey = '';
  try {
    storageKey = decodeStorageKeyFromQuery(k);
  } catch (e: unknown) {
    res.status(400).type('text/plain').send(e instanceof Error ? e.message : 'Parâmetro k inválido.');
    return;
  }

  if (!verifyMediaSignature(storageKey, s)) {
    res.status(400).type('text/plain').send('Assinatura inválida.');
    return;
  }

  let absPath = '';
  try {
    absPath = resolveAbsolutePath(storageKey);
  } catch {
    res.status(400).type('text/plain').send('Caminho inválido.');
    return;
  }

  try {
    const buf = await readBuffer(storageKey);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(contentTypeForFile(absPath));
    res.send(buf);
  } catch {
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
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao testar media save buffer.';
    res.status(500).json({ error: msg });
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
