import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  getTenantLocalization,
  normalizeLocalizationInput,
  resolveTenantLocalization,
  updateTenantLocalization,
} from '../services/tenantLocalizationService.js';

const putBodySchema = z.object({
  enabled_currencies: z.array(z.string()).min(1).max(8),
  default_currency: z.string().min(3).max(3),
});

export async function getMyTenantLocalization(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;

    const row = await getTenantLocalization(tenantId);
    if (!row) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }
    res.json(resolveTenantLocalization(row));
  } catch (error) {
    console.error('getMyTenantLocalization error:', error);
    res.status(500).json({ error: 'Erro ao carregar localização' });
  }
}

export async function putMyTenantLocalization(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = requireTenantId(req, res);
    if (!tenantId) return;

    await assertModulePermission(userId, 'settings', 'edit', undefined, req);

    const body = putBodySchema.parse(req.body ?? {});
    const normalized = normalizeLocalizationInput(body);
    if (!normalized.ok) {
      res.status(400).json({ error: normalized.error });
      return;
    }

    const resolved = await updateTenantLocalization(tenantId, normalized.value);
    res.json(resolved);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
      return;
    }
    console.error('putMyTenantLocalization error:', error);
    res.status(500).json({ error: 'Erro ao salvar localização' });
  }
}
