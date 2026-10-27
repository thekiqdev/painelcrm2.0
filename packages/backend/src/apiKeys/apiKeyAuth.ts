import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { isTenantAdmin } from '../utils/tenant.js';
import { isApiKeysEnabled } from './apiKeyFlags.js';

export async function requireApiKeysEnabled(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const enabled = await isApiKeysEnabled({
    tenantId: req.tenantId,
    userId: req.userId,
  });
  if (!enabled) {
    res.status(404).json({ error: 'Not found', code: 'API_KEYS_DISABLED' });
    return;
  }
  next();
}

export async function requireTenantAdminForApiKeys(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const admin = await isTenantAdmin(req.userId);
  if (!admin) {
    res.status(403).json({
      error: 'Apenas o administrador da conta pode gerenciar chaves de API.',
      code: 'API_KEYS_FORBIDDEN',
    });
    return;
  }
  next();
}
