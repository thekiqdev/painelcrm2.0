import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { getTenantIdOrNull } from '../utils/tenantScope.js';
import {
  assertAllowedImageUpload,
  buildCatalogMediaPublicUrl,
  buildCatalogMediaRelativeKey,
  getScopeFromCatalogMediaKey,
  isCatalogMediaKeyOwnedByTenantUser,
  saveCatalogMediaBuffer,
  unlinkCatalogMediaRelativeKey,
  type CatalogMediaScope,
} from '../services/catalogMediaUploadService.js';
import { extractCatalogMediaRelativeKeyFromStoredUrl } from '../utils/catalogMediaPublicSignedUrl.js';
import { isMediaSimpleUploadsServiceEnabled } from '../services/media/mediaConfig.js';
import { deleteFile } from '../services/media/mediaLocalStorageAdapter.js';
import {
  isMediaSimpleUploadOwnedBy,
  maybeUnlinkPreviousSimpleUpload,
  parseMediaServiceSimpleStorageKey,
  saveSimpleUploadFromBuffer,
} from '../services/media/simpleUploadMediaService.js';

const scopeSchema = z.enum([
  'product',
  'store_logo',
  'store_banner',
  'tenant_logo_light',
  'tenant_logo_dark',
  'user_avatar',
]);

const deleteBodySchema = z.object({
  key: z.string().min(1).max(2048),
});

function resolvePreviousCatalogKeyFromBody(
  raw: unknown,
  tenantId: string | null,
  userId: string,
  scope: CatalogMediaScope,
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const extracted =
    extractCatalogMediaRelativeKeyFromStoredUrl(trimmed) ||
    (trimmed.startsWith('tenants/') ? trimmed : null);
  if (!extracted || !isCatalogMediaKeyOwnedByTenantUser(extracted, tenantId, userId)) return null;
  const prevScope = getScopeFromCatalogMediaKey(extracted);
  if (prevScope !== scope) return null;
  return extracted;
}

async function maybeUnlinkPreviousCatalogFile(
  previousKey: string | null,
  newKey: string,
  tenantId: string | null,
  userId: string,
  scope: CatalogMediaScope,
): Promise<void> {
  if (!previousKey || previousKey === newKey) return;
  if (!isCatalogMediaKeyOwnedByTenantUser(previousKey, tenantId, userId)) return;
  if (getScopeFromCatalogMediaKey(previousKey) !== scope) return;
  try {
    await unlinkCatalogMediaRelativeKey(previousKey);
  } catch (e) {
    console.warn('[catalogMediaUpload] falha ao remover ficheiro anterior', {
      previousKey,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function postCatalogMediaUpload(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (process.env.CATALOG_MEDIA_UPLOAD_ENABLED === 'false') {
      res.status(503).json({ error: 'Upload de mídia desabilitado neste ambiente.' });
      return;
    }

    const userId = req.userId!;
    const scopeRaw = scopeSchema.parse(req.body?.scope);
    const scope = scopeRaw as CatalogMediaScope;
    if (scope === 'tenant_logo_light' || scope === 'tenant_logo_dark') {
      await assertModulePermission(userId, 'settings', 'edit', undefined, req);
    } else if (scope === 'user_avatar') {
      /* avatar pessoal — sem permissão de módulo */
    } else {
      await assertModulePermission(userId, 'products', 'edit', undefined, req);
    }
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: 'Arquivo obrigatório (campo file).' });
      return;
    }

    assertAllowedImageUpload(file.mimetype, file.size);

    const tenantId = getTenantIdOrNull(req.tenantId);

    if (isMediaSimpleUploadsServiceEnabled()) {
      const simpleScopes: CatalogMediaScope[] = [
        'user_avatar',
        'tenant_logo_light',
        'tenant_logo_dark',
        'store_logo',
      ];
      if (simpleScopes.includes(scope)) {
        if ((scope === 'tenant_logo_light' || scope === 'tenant_logo_dark') && !tenantId) {
          res.status(400).json({ error: 'Tenant obrigatório para logo da empresa.' });
          return;
        }
        const tenantSegment = tenantId || 'no-tenant';
        const saved = await saveSimpleUploadFromBuffer({
          tenantSegment,
          tenantUuid: tenantId,
          userId,
          catalogScope: scope as 'user_avatar' | 'tenant_logo_light' | 'tenant_logo_dark' | 'store_logo',
          buffer: file.buffer,
          mimeType: file.mimetype,
          originalFilename: file.originalname,
        });
        await maybeUnlinkPreviousSimpleUpload({
          previousRaw: req.body?.previous_key,
          newKey: saved.storageKey,
          tenantUuid: tenantId,
          userId,
          catalogScope: scope,
        });
        res.json({ publicUrl: saved.relativeUrl, key: saved.storageKey });
        return;
      }
    }

    const relativeKey = buildCatalogMediaRelativeKey({
      tenantId,
      userId,
      scope,
      contentType: file.mimetype,
      originalName: file.originalname,
    });

    await saveCatalogMediaBuffer(relativeKey, file.buffer);
    const previousKey = resolvePreviousCatalogKeyFromBody(req.body?.previous_key, tenantId, userId, scope);
    await maybeUnlinkPreviousCatalogFile(previousKey, relativeKey, tenantId, userId, scope);

    const publicUrl = buildCatalogMediaPublicUrl(req, relativeKey);

    res.json({ publicUrl, key: relativeKey });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const errMsg = error instanceof Error ? error.message : 'Erro ao salvar arquivo';
    const errCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code || '')
        : '';

    if (errCode === 'EROFS' || errCode === 'EACCES' || errCode === 'EPERM' || errCode === 'ENOSPC') {
      console.error('[catalogMediaUpload] storage write failed', {
        code: errCode,
        message: errMsg,
        tenantId: req.tenantId ?? null,
        userId: req.userId ?? null,
        scope: req.body?.scope ?? null,
        storageRoot: process.env.CATALOG_MEDIA_STORAGE_PATH || '(default ./uploads)',
      });
      res.status(500).json({
        error:
          'Falha ao gravar arquivo no storage do servidor. Verifique volume/permissões (CATALOG_MEDIA_STORAGE_PATH) no EasyPanel.',
        code: 'CATALOG_MEDIA_STORAGE_WRITE_FAILED',
      });
      return;
    }

    console.error('[catalogMediaUpload] upload failed', {
      code: errCode || null,
      message: errMsg,
      tenantId: req.tenantId ?? null,
      userId: req.userId ?? null,
      scope: req.body?.scope ?? null,
    });
    res.status(400).json({ error: errMsg });
  }
}

/** POST /api/catalog-media/delete — remove ficheiro no disco (JSON { key }). */
export async function postCatalogMediaDelete(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (process.env.CATALOG_MEDIA_UPLOAD_ENABLED === 'false') {
      res.status(503).json({ error: 'Upload de mídia desabilitado neste ambiente.' });
      return;
    }

    const userId = req.userId!;
    const { key } = deleteBodySchema.parse(req.body);
    const tenantId = getTenantIdOrNull(req.tenantId);
    const tenantSegment = tenantId || 'no-tenant';

    if (!key.includes('/users/')) {
      const parsed = parseMediaServiceSimpleStorageKey(key);
      if (parsed) {
        if (!isMediaSimpleUploadOwnedBy(key, { tenantSegment, tenantUuid: tenantId, userId })) {
          res.status(403).json({ error: 'Chave inválida ou sem permissão.' });
          return;
        }
        if (parsed.scope === 'tenant_logo') {
          await assertModulePermission(userId, 'settings', 'edit', undefined, req);
        } else if (parsed.scope === 'user_avatar') {
          /* chave validada por ownership */
        } else if (parsed.scope === 'store_logo') {
          await assertModulePermission(userId, 'products', 'edit', undefined, req);
        }
        await deleteFile(key);
        res.json({ ok: true });
        return;
      }
    }

    if (!isCatalogMediaKeyOwnedByTenantUser(key, tenantId, userId)) {
      res.status(403).json({ error: 'Chave inválida ou sem permissão.' });
      return;
    }

    const scope = getScopeFromCatalogMediaKey(key);
    if (!scope) {
      res.status(400).json({ error: 'Chave de arquivo inválida.' });
      return;
    }

    if (scope === 'tenant_logo_light' || scope === 'tenant_logo_dark') {
      await assertModulePermission(userId, 'settings', 'edit', undefined, req);
    } else if (scope === 'user_avatar') {
      /* permitido se a chave for do próprio utilizador (validado em isCatalogMediaKeyOwnedByTenantUser) */
    } else {
      await assertModulePermission(userId, 'products', 'edit', undefined, req);
    }

    await unlinkCatalogMediaRelativeKey(key);
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    const errMsg = error instanceof Error ? error.message : 'Erro ao remover arquivo';
    console.error('[catalogMediaDelete]', errMsg);
    res.status(400).json({ error: errMsg });
  }
}
