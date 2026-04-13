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

const scopeSchema = z.enum(['product', 'store_logo', 'store_banner']);

export async function postCatalogMediaUpload(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (process.env.CATALOG_MEDIA_UPLOAD_ENABLED === 'false') {
      res.status(503).json({ error: 'Upload de mídia desabilitado neste ambiente.' });
      return;
    }

    const userId = req.userId!;
    await assertModulePermission(userId, 'products', 'edit', undefined, req);

    const scope = scopeSchema.parse(req.body?.scope);
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
      scope: scope as CatalogMediaScope,
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
    const msg = error instanceof Error ? error.message : 'Erro ao salvar arquivo';
    res.status(400).json({ error: msg });
  }
}
