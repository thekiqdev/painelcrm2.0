import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';

/**
 * Injeta um tenant virtual para isolar a camada operacional do Super Admin.
 * Deve rodar antes de `setRequestDb` para que `SET LOCAL app.current_tenant_id` seja consistente.
 */
export function setSuperadminOpsTenant(req: AuthRequest, _res: Response, next: NextFunction): void {
  req.tenantId = SUPERADMIN_OPS_KANBAN_TENANT_ID;
  next();
}

