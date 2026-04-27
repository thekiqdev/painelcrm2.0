import { apiClient } from '@/integrations/api/client';
import { normalizeCatalogMediaUrlForBrowser } from '@/services/catalogMediaUpload';

export interface MePersonalDto {
  email: string;
  first_name: string | null;
  last_name: string | null;
  whatsapp_number: string;
  job_title: string | null;
  locale: string | null;
  timezone: string | null;
  avatar_url: string | null;
}

export interface MeProfileResponse {
  personal: MePersonalDto;
  can_edit_business_profile: boolean;
}

export interface MeBusinessTenantDto {
  id: string;
  name: string | null;
  cpf_cnpj: string | null;
  company_legal_name: string | null;
  company_email: string | null;
  company_website: string | null;
  company_whatsapp: string | null;
  company_postal_code: string | null;
  company_street: string | null;
  company_number: string | null;
  company_district: string | null;
  company_address_line: string | null;
  company_city: string | null;
  company_state: string | null;
  logo_url: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  timezone: string | null;
  locale: string | null;
}

export type MeBusinessPutPayload = Partial<{
  name: string;
  company_legal_name: string | null;
  cpf_cnpj: string | null;
  company_email: string | null;
  company_whatsapp: string | null;
  company_website: string | null;
  company_postal_code: string | null;
  company_street: string | null;
  company_number: string | null;
  company_district: string | null;
  company_city: string | null;
  company_state: string | null;
  company_address_line: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
}>;

export async function getMeProfile(): Promise<{ data?: MeProfileResponse; error?: string }> {
  const res = await apiClient.get<MeProfileResponse>('/api/me/profile');
  if (res.error) return { error: res.error };
  return { data: res.data };
}

export async function putMeProfile(body: {
  first_name?: string | null;
  last_name?: string | null;
  whatsapp_number?: string | null;
  job_title?: string | null;
  locale?: string | null;
  timezone?: string | null;
  avatar_url?: string | null;
}): Promise<{ data?: { personal: MePersonalDto }; error?: string }> {
  const res = await apiClient.put<{ personal: MePersonalDto }>('/api/me/profile', body);
  if (res.error) return { error: res.error };
  return { data: res.data };
}

export async function postMeProfileAvatar(file: File): Promise<{ avatar_url?: string; error?: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.post<{ avatar_url: string }>('/api/me/profile/avatar', form);
  if (res.error) return { error: res.error };
  const raw = res.data?.avatar_url;
  return { avatar_url: raw ? normalizeCatalogMediaUrlForBrowser(raw) : undefined };
}

export async function postMeProfilePasswordRequestCode(): Promise<{ ok?: true; error?: string; code?: string }> {
  const res = await apiClient.post<{ ok?: boolean }>('/api/me/profile/password/request-code', {});
  if (res.error) return { error: res.error, code: res.code };
  return { ok: true };
}

export async function postMeProfilePasswordConfirm(body: {
  code: string;
  new_password: string;
  confirm_password: string;
}): Promise<{ ok?: true; error?: string; message?: string }> {
  const res = await apiClient.post<{ ok?: boolean; message?: string }>('/api/me/profile/password/confirm', body);
  if (res.error) return { error: res.error };
  return { ok: true, message: res.data?.message };
}

export async function getMeBusinessProfile(): Promise<{ data?: { business: MeBusinessTenantDto }; error?: string }> {
  const res = await apiClient.get<{ business: MeBusinessTenantDto }>('/api/me/business-profile');
  if (res.error) return { error: res.error };
  return { data: res.data };
}

export async function putMeBusinessProfile(
  body: MeBusinessPutPayload,
): Promise<{ data?: { business: MeBusinessTenantDto }; error?: string }> {
  const res = await apiClient.put<{ business: MeBusinessTenantDto }>('/api/me/business-profile', body);
  if (res.error) return { error: res.error };
  return { data: res.data };
}
