import { apiClient } from '@/integrations/api/client';

export interface TenantBillingPreferencesResponse {
  timezone: string | null;
  recurring_generate_time_local: string | null;
  invoice_notify_same_as_generation: boolean | null;
  invoice_notify_time_local: string | null;
  defaults?: {
    timezone: string;
    recurring_generate_time_local: string;
    invoice_notify_same_as_generation: boolean;
    invoice_notify_time_local: string | null;
  };
  sources?: {
    timezone: 'tenant' | 'fallback_default';
    recurring_generate_time_local: 'tenant' | 'fallback_default';
    invoice_notify_same_as_generation: 'tenant' | 'fallback_default';
    invoice_notify_time_local: 'tenant' | 'derived_from_generation' | 'fallback_default';
  };
  effective?: {
    timezone: string;
    recurring_generate_time_local: string;
    invoice_notify_same_as_generation: boolean;
    invoice_notify_time_local: string | null;
  };
  message?: string;
}

export interface PutTenantBillingPreferencesBody {
  timezone: string | null;
  recurring_generate_time_local: string;
  invoice_notify_same_as_generation: boolean;
  invoice_notify_time_local?: string | null;
}

export async function getMyTenantBillingPreferences(): Promise<{
  data?: TenantBillingPreferencesResponse;
  error?: string;
}> {
  return apiClient.get<TenantBillingPreferencesResponse>('/api/me/tenant/billing-preferences');
}

export async function putMyTenantBillingPreferences(body: PutTenantBillingPreferencesBody): Promise<{
  data?: TenantBillingPreferencesResponse;
  error?: string;
}> {
  return apiClient.put<TenantBillingPreferencesResponse>('/api/me/tenant/billing-preferences', body);
}
