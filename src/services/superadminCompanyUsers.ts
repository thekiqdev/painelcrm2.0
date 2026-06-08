import { apiClient } from '@/integrations/api/client';

export type SuperadminCompanyUserDetail = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  whatsapp_number: string | null;
  job_title: string | null;
  role: string | null;
  last_used_at: string | null;
  is_super_admin: boolean;
};

export async function getSuperadminCompanyUser(tenantId: string, userId: string) {
  return apiClient.get<{ ok: boolean; user?: SuperadminCompanyUserDetail; error?: string }>(
    `/api/superadmin/companies/${tenantId}/users/${userId}`,
  );
}

export type PatchSuperadminCompanyUserPayload = {
  full_name?: string;
  email?: string;
  phone?: string | null;
  job_title?: string | null;
};

export async function patchSuperadminCompanyUser(
  tenantId: string,
  userId: string,
  payload: PatchSuperadminCompanyUserPayload,
) {
  return apiClient.patch<{ ok: boolean; user?: SuperadminCompanyUserDetail; error?: string }>(
    `/api/superadmin/companies/${tenantId}/users/${userId}`,
    payload,
  );
}

export async function resetSuperadminCompanyUserPassword(
  tenantId: string,
  userId: string,
  newPassword: string,
  confirmPassword: string,
) {
  return apiClient.post<{ ok: boolean; error?: string }>(
    `/api/superadmin/companies/${tenantId}/users/${userId}/reset-password`,
    { new_password: newPassword, confirm_password: confirmPassword },
  );
}
