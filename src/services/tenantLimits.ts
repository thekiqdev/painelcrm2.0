import { apiClient } from '@/integrations/api/client';

export interface TenantLimitsUsers {
  current: number;
  limit: number | null;
  allowed: boolean;
}

export interface TenantLimits {
  users: TenantLimitsUsers;
}

export interface TenantUser {
  id: string;
  email: string;
  full_name: string | null;
  last_used_at: string | null;
  role: string | null;
  custom_role_id?: string | null;
  custom_role_name?: string | null;
  is_super_admin: boolean;
}

export async function getTenantLimits(): Promise<TenantLimits | null> {
  const response = await apiClient.get<TenantLimits>('/api/me/tenant/limits');
  if (response.error) return null;
  return response.data ?? null;
}

export async function getMyTenantUsers(): Promise<TenantUser[]> {
  const response = await apiClient.get<TenantUser[]>('/api/me/tenant/users');
  if (response.error) throw new Error(response.error);
  return response.data ?? [];
}

export interface TenantRole {
  role: string;
  name: string;
  permissions?: string[];
  /** Quando role === 'custom', id do perfil personalizado */
  id?: string;
}

export async function getTenantRoles(): Promise<TenantRole[]> {
  const response = await apiClient.get<TenantRole[]>('/api/me/tenant/roles');
  if (response.error) throw new Error(response.error);
  return response.data ?? [];
}

export type SetUserRolePayload =
  | { role: string; custom_role_id?: never }
  | { custom_role_id: string; role?: never };

export async function setUserRole(
  userId: string,
  payload: SetUserRolePayload
): Promise<{ role?: string; custom_role_id?: string }> {
  const response = await apiClient.put<{ role?: string; custom_role_id?: string }>(
    `/api/me/tenant/users/${userId}/role`,
    payload
  );
  if (response.error) throw new Error(response.error);
  return response.data ?? payload;
}

/** Opções de perfil base para copiar permissões ao criar perfil personalizado. */
export const BASE_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Nenhum (todas desmarcadas)' },
  { value: 'member', label: 'Operacional' },
  { value: 'manager', label: 'Gestor' },
  { value: 'viewer', label: 'Visualizador' },
];

export async function addTenantRole(
  name: string,
  baseRole?: string
): Promise<TenantRole> {
  const body: { name: string; base_role?: string } = { name: name.trim() };
  if (baseRole && ['member', 'manager', 'viewer'].includes(baseRole)) {
    body.base_role = baseRole;
  }
  const response = await apiClient.post<TenantRole>('/api/me/tenant/roles', body);
  if (response.error) throw new Error(response.error);
  if (!response.data) throw new Error('Resposta inválida');
  return response.data;
}
