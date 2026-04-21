import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { getTenantIdOrNull } from '../utils/tenantScope.js';
import {
  assertAllowedImageUpload,
  buildCatalogMediaPublicUrl,
  buildCatalogMediaRelativeKey,
  saveCatalogMediaBuffer,
  type CatalogMediaScope,
} from '../services/catalogMediaUploadService.js';

const scopeSchema = z.enum(['product', 'store_logo', 'store_banner', 'tenant_logo_light', 'tenant_logo_dark']);

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
    const relativeKey = buildCatalogMediaRelativeKey({
      tenantId,
      userId,
      scope,
      contentType: file.mimetype,
      originalName: file.originalname,
    });

    await saveCatalogMediaBuffer(relativeKey, file.buffer);
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
