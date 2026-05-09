/**
 * Valida chave granular do catálogo (403). Cache em req.permissionMap quando disponível.
 */
import type { AuthRequest } from '../middleware/auth.js';
import { getEffectiveModulePermissions } from '../services/modulePermissionsService.js';
import { isTenantAdmin } from '../utils/tenant.js';
import { ModulePermissionError } from './errors.js';
import type { ModulePermissionsMap, RequestWithPermissionMap } from './permissionTypes.js';
import { hasPermissionKey, type PermissionCatalogKey } from './permissionCatalog.js';

type Req = AuthRequest & RequestWithPermissionMap;

function permissionDebugLog(payload: Record<string, unknown>): void {
  if (process.env.PERMISSION_DEBUG !== '1') return;
  console.log('[permission-check]', JSON.stringify(payload));
}

export async function assertPermissionKey(
  userId: string | undefined | null,
  key: PermissionCatalogKey,
  req?: Req
): Promise<ModulePermissionsMap> {
  if (!userId) {
    permissionDebugLog({ key, route: req?.originalUrl ?? req?.path ?? null, allowed: false, source: 'assertPermissionKey', reason: 'no_user' });
    throw new ModulePermissionError(401, 'Usuário não identificado.');
  }

  let map: ModulePermissionsMap | undefined = req?.permissionMap?.[userId];
  if (!map) {
    map = await getEffectiveModulePermissions(userId);
    if (req) {
      req.permissionMap = req.permissionMap ?? {};
      req.permissionMap[userId] = map;
    }
  }

  const admin = await isTenantAdmin(userId);
  const allowed = hasPermissionKey(map, key, { isTenantAdmin: admin });

  permissionDebugLog({
    key,
    route: req?.originalUrl ?? req?.path ?? null,
    allowed,
    source: 'assertPermissionKey',
    userId,
    isTenantAdmin: admin,
  });

  if (!allowed) {
    throw new ModulePermissionError(403, 'Sem permissão para esta ação.');
  }

  return map;
}
