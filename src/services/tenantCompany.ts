import { apiClient } from '@/integrations/api/client';
import type { TenantCompanyPayload } from './tenantCompanyTypes';
import {
  getTenantCompanySingleFlight,
  invalidateTenantCompanyHttpCache,
  seedTenantCompanyHttpCache,
} from './tenantCompanyHttpCache';

export type { TenantCompanyPayload } from './tenantCompanyTypes';

export async function getMyTenantCompany(): Promise<{ data?: TenantCompanyPayload; error?: string }> {
  return getTenantCompanySingleFlight(() =>
    apiClient.get<TenantCompanyPayload>('/api/me/tenant/company'),
  );
}

export async function putMyTenantCompany(
  body: Partial<{
    name: string;
    cpf_cnpj: string | null;
    billing_phone: string | null;
    company_whatsapp: string | null;
    company_address_line: string | null;
    company_city: string | null;
    company_state: string | null;
    company_postal_code: string | null;
    logo_light_url: string | null;
    logo_dark_url: string | null;
  }>
): Promise<{ data?: TenantCompanyPayload; error?: string }> {
  const res = await apiClient.put<TenantCompanyPayload>('/api/me/tenant/company', body);
  if (!res.error && res.data) {
    seedTenantCompanyHttpCache(res.data);
  } else {
    invalidateTenantCompanyHttpCache();
  }
  return res;
}

export { invalidateTenantCompanyHttpCache };
