/**
 * Utilitário para parsear o descritor "module.action" usado em requirePermission.
 * Valida formato e que a action é uma PermissionAction válida; evita duplicação de lógica.
 */

import type { ModuleId, PermissionAction, PermissionDescriptor } from './permissionTypes.js';

const ALLOWED_ACTIONS: PermissionAction[] = [
  'create',
  'view',
  'edit',
  'delete',
  'proposals_send',
  'proposals_convert_invoice',
  'proposals_manage_integrations',
];

function isPermissionAction(s: string): s is PermissionAction {
  return ALLOWED_ACTIONS.includes(s as PermissionAction);
}

/**
 * Parseia o descritor "module.action" e valida a action.
 *
 * @param descriptor - String no formato "moduleId.action" (ex.: "clients.create", "tasks.edit")
 * @returns { module, action } com module como ModuleId e action como PermissionAction
 * @throws Error se o formato for inválido (falta ".") ou a action não for create|view|edit|delete
 */
export function parsePermissionDescriptor(
  descriptor: PermissionDescriptor
): { module: ModuleId; action: PermissionAction } {
  const dot = descriptor.indexOf('.');
  if (dot === -1) {
    throw new Error("Invalid permission descriptor. Expected 'module.action' (e.g. clients.create)");
  }
  const modulePart = descriptor.slice(0, dot);
  const actionPart = descriptor.slice(dot + 1);
  if (!isPermissionAction(actionPart)) {
    throw new Error(
      `Invalid permission action '${actionPart}'. Allowed: ${ALLOWED_ACTIONS.join(', ')}`
    );
  }
  return { module: modulePart as ModuleId, action: actionPart };
}
