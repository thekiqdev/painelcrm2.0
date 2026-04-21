import { apiClient } from '@/integrations/api/client';

export interface ModuleSchemaItem {
  id: string;
  label: string;
  supportsEditOwn: boolean;
  supportsDeleteOwn: boolean;
}

export interface ModulePermission {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  edit_own_only: boolean;
  delete_own_only: boolean;
  /** Extras do backend (ex.: propostas Etapa 5). */
  module_extras?: Record<string, unknown>;
}

export interface ModulePermissionsMap {
  [moduleId: string]: ModulePermission;
}

export interface ModulePermissionsSchemaResponse {
  modules: ModuleSchemaItem[];
}

export interface RolePermissionsResponse {
  role: string;
  permissions: ModulePermissionsMap;
}

export async function getModulePermissionsSchema(): Promise<ModuleSchemaItem[]> {
  const response = await apiClient.get<ModulePermissionsSchemaResponse>(
    '/api/me/tenant/module-permissions-schema'
  );
  if (response.error) throw new Error(response.error);
  return response.data?.modules ?? [];
}

/** Obtém permissões por módulo de um perfil (sistema ou customizado). */
export async function getRolePermissions(
  roleOrCustomId: string,
  isCustom = false
): Promise<ModulePermissionsMap> {
  const url = isCustom
    ? `/api/me/tenant/custom-roles/${encodeURIComponent(roleOrCustomId)}/permissions`
    : `/api/me/tenant/roles/${encodeURIComponent(roleOrCustomId)}/permissions`;
  const response = await apiClient.get<RolePermissionsResponse>(url);
  if (response.error) throw new Error(response.error);
  return response.data?.permissions ?? {};
}

/** Atualiza permissões por módulo de um perfil (sistema ou customizado). */
export async function putRolePermissions(
  roleOrCustomId: string,
  permissions: ModulePermissionsMap,
  isCustom = false
): Promise<ModulePermissionsMap> {
  const url = isCustom
    ? `/api/me/tenant/custom-roles/${encodeURIComponent(roleOrCustomId)}/permissions`
    : `/api/me/tenant/roles/${encodeURIComponent(roleOrCustomId)}/permissions`;
  const response = await apiClient.put<RolePermissionsResponse>(url, { permissions });
  if (response.error) throw new Error(response.error);
  return response.data?.permissions ?? {};
}

export interface MyPermissionsResponse {
  permissions: ModulePermissionsMap;
}

/** Permissões efetivas do usuário logado (para menu e ações). */
export async function getMyPermissions(): Promise<ModulePermissionsMap> {
  const response = await apiClient.get<MyPermissionsResponse>('/api/me/tenant/my-permissions');
  if (response.error) throw new Error(response.error);
  return response.data?.permissions ?? {};
}
