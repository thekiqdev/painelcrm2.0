/**
 * Resolver de permissões efetivas por módulo para um usuário.
 * Usa versionamento (permissionVersionService) na chave do cache para invalidar ao alterar role/custom role.
 *
 * Preparação para Permission Snapshot (futuro): este módulo está preparado para, no futuro,
 * tentar primeiro um snapshot (ex.: tabela user_permission_snapshots com JSON do mapa) e só
 * recalcular via getEffectiveModulePermissions quando necessário.
 */

import type { ModulePermissionsMap } from './permissionTypes.js';
import { getPermissionVersion } from '../services/permissionVersionService.js';
import { getEffectiveModulePermissions } from '../services/modulePermissionsService.js';
import { permissionCache } from './permissionCache.js';

const PERMISSION_CACHE_TTL_SECONDS = Number(process.env.PERMISSION_CACHE_TTL) || 120;

/**
 * Retorna as permissões efetivas por módulo para o usuário.
 * Cache key = permissions:userId:version; cache miss chama getEffectiveModulePermissions e armazena no cache.
 *
 * @param userId - UUID do usuário
 * @returns Mapa módulo → permissões (can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only)
 */
export async function resolveModulePermissions(userId: string): Promise<ModulePermissionsMap> {
  if (PERMISSION_CACHE_TTL_SECONDS <= 0) {
    return getEffectiveModulePermissions(userId);
  }

  const version = await getPermissionVersion(userId);
  const cacheKey = `permissions:${userId}:${version}`;

  const cached = await permissionCache.get(cacheKey);
  if (cached != null) return cached;

  const map = await getEffectiveModulePermissions(userId);
  await permissionCache.set(cacheKey, map, PERMISSION_CACHE_TTL_SECONDS);
  return map;
}
