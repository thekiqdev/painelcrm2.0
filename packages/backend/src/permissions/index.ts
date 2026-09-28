/**
 * Permission Engine — barrel export.
 *
 * Uso em controllers:
 *   import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
 *
 * Uso em rotas:
 *   import { requirePermission } from '../permissions/index.js';
 *   router.post('/', requirePermission('clients.create'), clientsController.createClient);
 */

export type {
  PermissionAction,
  ModuleId,
  ModulePermissionRow,
  ModulePermissionsMap,
  RequestWithPermissionMap,
  AssertModulePermissionOptions,
  PermissionDescriptor,
  PermissionCheckResult,
  CheckPermissionContext,
} from './permissionTypes.js';

export {
  check,
  checkPermission,
  logPermissionDenied,
  type PermissionDeniedReason,
  type LogPermissionDeniedParams,
} from './permissionEngine.js';
export { ModulePermissionError } from './errors.js';
export { assertModulePermission } from './assertModulePermission.js';
export { assertPermissionKey } from './assertPermissionKey.js';
export { requirePermission } from './requirePermission.js';
export { parsePermissionDescriptor } from './parsePermissionDescriptor.js';
export { resolveModulePermissions } from './modulePermissionResolver.js';
export { permissionCache, type PermissionCacheAdapter } from './permissionCache.js';
export { evaluateRules, type RuleUser, type RuleResource } from './permissionRulesEngine.js';
