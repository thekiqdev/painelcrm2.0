import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.js';
import { mergeRequestContext } from '../context/requestContext.js';

/**
 * Enriquece ALS com user/tenant após authenticateToken / setCurrentTenant.
 * Não bloqueia request se ALS ausente (ex.: correlation middleware off).
 */
export function bindRequestContext(req: AuthRequest, _res: Response, next: NextFunction): void {
  mergeRequestContext({
    userId: req.userId,
    tenantId: req.tenantId ?? undefined,
  });
  next();
}
