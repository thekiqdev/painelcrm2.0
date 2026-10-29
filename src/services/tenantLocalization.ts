import { apiClient } from '@/integrations/api/client';
import type { AppCurrency } from '@/lib/i18n/appCurrency';

export type TenantLocalizationResponse = {
  available_currencies: AppCurrency[];
  enabled_currencies: AppCurrency[];
  default_currency: AppCurrency;
};

export async function getMyTenantLocalization(): Promise<{
  data?: TenantLocalizationResponse;
  error?: string;
}> {
  return apiClient.get<TenantLocalizationResponse>('/api/me/tenant/localization');
}

export async function putMyTenantLocalization(body: {
  enabled_currencies: AppCurrency[];
  default_currency: AppCurrency;
}): Promise<{ data?: TenantLocalizationResponse; error?: string }> {
  return apiClient.put<TenantLocalizationResponse>('/api/me/tenant/localization', body);
}
