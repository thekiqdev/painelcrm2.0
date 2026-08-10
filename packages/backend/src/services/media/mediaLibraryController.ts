import type { Response } from 'express';
import type { AuthRequest } from '../../middleware/auth.js';
import { ModulePermissionError } from '../../permissions/index.js';
import { assertModulePermission } from '../../permissions/assertModulePermission.js';
import {
  getMediaLibraryQuota,
  listMediaLibraryAssets,
  MediaLibraryQuotaError,
  softDeleteMediaLibraryAsset,
  uploadMediaLibraryAsset,
} from './mediaLibraryService.js';

function requireTenantId(req: AuthRequest): string {
  const tid = String(req.tenantId || '').trim();
  if (!tid) throw new ModulePermissionError(403, 'Tenant obrigatório.');
  return tid;
}

/**
 * S33.1/S33.2 — picker no chat/produtos/flows: listagem/upload com settings **ou** chat **ou** products **ou** chatbot_flows.
 * Soft-delete permanece restrito a settings.edit (gestão da library).
 */
async function assertMediaLibraryPickerAccess(
  userId: string,
  mode: 'view' | 'upload',
  req: AuthRequest,
): Promise<void> {
  const action = mode === 'view' ? 'view' : 'edit';
  const modules = ['settings', 'chat', 'products', 'chatbot_flows'] as const;
  let last: ModulePermissionError | null = null;
  for (const moduleId of modules) {
    try {
      await assertModulePermission(userId, moduleId, action, undefined, req);
      return;
    } catch (e: unknown) {
      if (e instanceof ModulePermissionError) {
        last = e;
        continue;
      }
      throw e;
    }
  }
  throw (
    last ??
    new ModulePermissionError(
      403,
      mode === 'view'
        ? 'Sem permissão para ver a Media Library.'
        : 'Sem permissão para carregar na Media Library.',
    )
  );
}

/** GET /api/media/v1/library — lista assets da Media Library do tenant. */
export async function listMediaLibrary(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const userId = String(req.userId || '').trim();
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertMediaLibraryPickerAccess(userId, 'view', req);

    const limitRaw = parseInt(String(req.query.limit || '50'), 10);
    const offsetRaw = parseInt(String(req.query.offset || '0'), 10);
    const q = typeof req.query.q === 'string' ? req.query.q : null;

    const result = await listMediaLibraryAssets({
      tenantId,
      limit: Number.isFinite(limitRaw) ? limitRaw : 50,
      offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
      q,
    });

    res.json({
      ok: true,
      items: result.items,
      total: result.total,
      quota: result.quota,
    });
  } catch (e: unknown) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : 'Erro ao listar Media Library.';
    console.error('[media-library] list', e);
    res.status(500).json({ ok: false, error: msg });
  }
}

/** GET /api/media/v1/library/quota — uso vs limites. */
export async function getMediaLibraryQuotaHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const userId = String(req.userId || '').trim();
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertMediaLibraryPickerAccess(userId, 'view', req);
    const quota = await getMediaLibraryQuota(tenantId);
    res.json({ ok: true, quota });
  } catch (e: unknown) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : 'Erro ao ler quota.';
    res.status(500).json({ ok: false, error: msg });
  }
}

/** POST /api/media/v1/library/upload — multipart field `file`. */
export async function postMediaLibraryUpload(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const userId = String(req.userId || '').trim();
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertMediaLibraryPickerAccess(userId, 'upload', req);

    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: 'Arquivo obrigatório (campo file).' });
      return;
    }

    const asset = await uploadMediaLibraryAsset({
      tenantId,
      userId,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalFilename: file.originalname,
    });

    res.status(201).json({ ok: true, asset });
  } catch (e: unknown) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    if (e instanceof MediaLibraryQuotaError) {
      res.status(413).json({
        ok: false,
        error: e.message,
        code: e.code,
        quota: e.details,
      });
      return;
    }
    const msg = e instanceof Error ? e.message : 'Erro no upload.';
    console.error('[media-library] upload', e);
    res.status(400).json({ ok: false, error: msg });
  }
}

/** DELETE /api/media/v1/library/:id — soft delete (impede leitura raw). */
export async function deleteMediaLibraryAsset(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const userId = String(req.userId || '').trim();
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertModulePermission(userId, 'settings', 'edit', undefined, req);

    const assetId = String(req.params.id || '').trim();
    const result = await softDeleteMediaLibraryAsset({ tenantId, assetId });
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 400;
      res.status(status).json({ ok: false, error: 'Asset não encontrado na Media Library.', reason: result.reason });
      return;
    }
    res.json({ ok: true, id: result.id });
  } catch (e: unknown) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : 'Erro ao apagar.';
    console.error('[media-library] delete', e);
    res.status(500).json({ ok: false, error: msg });
  }
}
