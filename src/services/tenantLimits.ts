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
  permissions: string[];
}

export async function getTenantRoles(): Promise<TenantRole[]> {
  const response = await apiClient.get<TenantRole[]>('/api/me/tenant/roles');
  if (response.error) throw new Error(response.error);
  return response.data ?? [];
}

export async function setUserRole(userId: string, role: string): Promise<{ role: string }> {
  const response = await apiClient.put<{ role: string }>(`/api/me/tenant/users/${userId}/role`, { role });
  if (response.error) throw new Error(response.error);
  return response.data ?? { role };
}
