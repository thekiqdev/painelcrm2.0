import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getCatalogMediaStorageRoot } from '../services/catalogMediaUploadService.js';
import { verifyCatalogMediaPublicQuery } from '../utils/catalogMediaPublicSignedUrl.js';

function contentTypeForFile(absPath: string): string {
  const lower = absPath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * GET /api/public/catalog-media/raw?k=&s=
 * Path sem extensão de imagem — contorna nginx que mapeia *.png para ficheiros estáticos.
 */
export async function getPublicCatalogMediaRaw(req: Request, res: Response): Promise<void> {
  const k = String(req.query.k || '').trim();
  const sig = String(req.query.s || '').trim();
  if (!k || !sig) {
    res.status(400).type('text/plain').send('Parâmetros k e s são obrigatórios.');
    return;
  }
  if (!verifyCatalogMediaPublicQuery(k, sig)) {
    console.warn('[publicCatalogMedia] assinatura inválida', { ip: req.ip });
    res.status(403).type('text/plain').send('Assinatura inválida.');
    return;
  }
  let relativeKey: string;
  try {
    relativeKey = Buffer.from(k, 'base64url').toString('utf8');
  } catch {
    res.status(400).type('text/plain').send('Parâmetro k inválido.');
    return;
  }
  if (!relativeKey || relativeKey.includes('..') || path.isAbsolute(relativeKey) || relativeKey.startsWith('/')) {
    res.status(400).type('text/plain').send('Caminho inválido.');
    return;
  }

  const root = getCatalogMediaStorageRoot();
  const abs = path.join(root, relativeKey);
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(abs);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
    console.warn('[publicCatalogMedia] path traversal bloqueado', { relativeKey });
    res.status(400).type('text/plain').send('Caminho inválido.');
    return;
  }

  try {
    const buf = await fs.readFile(resolvedFile);
    res.setHeader('Cache-Control', process.env.NODE_ENV === 'production' ? 'public, max-age=604800' : 'no-store');
    res.type(contentTypeForFile(resolvedFile));
    res.send(buf);
  } catch (e) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as NodeJS.ErrnoException).code) : '';
    console.warn('[publicCatalogMedia] ficheiro não encontrado', {
      relativeKey,
      resolvedFile,
      code: code || null,
      storageRoot: root,
    });
    res.status(404).type('text/plain').send('Ficheiro não encontrado.');
  }
}
