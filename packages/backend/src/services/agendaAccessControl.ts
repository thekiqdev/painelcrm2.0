/**
 * Regras de acesso à configuração da Agenda (Fase 5.5): disponibilidade empresa/utilizadores,
 * bloqueios e feriados em conjunto com permissões do módulo `settings`.
 */
import type { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission } from '../permissions/index.js';
import { getUserRoleInTenant } from './modulePermissionsService.js';

export async function isElevatedTenantRole(userId: string): Promise<boolean> {
  const role = await getUserRoleInTenant(userId);
  return role === 'admin' || role === 'manager';
}

/** Ver disponibilidade da empresa / ver utilizadores: settings.view ou papel elevado. */
export async function hasSettingsView(userId: string, req: AuthRequest): Promise<boolean> {
  if (await isElevatedTenantRole(userId)) return true;
  try {
    await assertModulePermission(userId, 'settings', 'view', undefined, req);
    return true;
  } catch {
    return false;
  }
}

/** Editar disponibilidade da empresa, outros utilizadores, bloqueios tenant/outros, feriados tenant: settings.edit ou papel elevado. */
export async function hasSettingsEdit(userId: string, req: AuthRequest): Promise<boolean> {
  if (await isElevatedTenantRole(userId)) return true;
  try {
    await assertModulePermission(userId, 'settings', 'edit', undefined, req);
    return true;
  } catch {
    return false;
  }
}
