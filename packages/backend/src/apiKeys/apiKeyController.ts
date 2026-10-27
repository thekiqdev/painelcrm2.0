import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import {
  ApiKeyNotFoundError,
  ApiKeyValidationError,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from './apiKeyService.js';

const createBodySchema = z.object({
  name: z.string(),
});

const idParamSchema = z.string().uuid();

export async function postApiKey(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    const tenantId = req.tenantId;
    if (!userId || !tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const body = createBodySchema.parse(req.body);
    const created = await createApiKey({ tenantId, userId, name: body.name });
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof ApiKeyValidationError) {
      const message = error instanceof ApiKeyValidationError ? error.message : 'Informe um nome para a chave.';
      res.status(400).json({ error: message });
      return;
    }
    console.error('postApiKey:', error instanceof Error ? error.message : 'error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getApiKeys(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const keys = await listApiKeys(tenantId);
    res.json({ keys });
  } catch (error) {
    console.error('getApiKeys:', error instanceof Error ? error.message : 'error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteApiKey(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma empresa' });
      return;
    }
    const parsed = idParamSchema.safeParse(req.params.id);
    if (!parsed.success) {
      res.status(400).json({ error: 'Identificador inválido' });
      return;
    }
    const revoked = await revokeApiKey(tenantId, parsed.data);
    res.json(revoked);
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('deleteApiKey:', error instanceof Error ? error.message : 'error');
    res.status(500).json({ error: 'Internal server error' });
  }
}
