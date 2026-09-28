import { apiClient } from '@/integrations/api/client';

export interface TenantBillingPreferencesResponse {
  timezone: string | null;
  recurring_generate_time_local: string | null;
  invoice_notify_same_as_generation: boolean | null;
  invoice_notify_time_local: string | null;
  /** Dias antes do vencimento do ciclo para gerar/enfileirar (mensal e demais; 0 = no dia do vencimento). */
  recurring_invoice_generate_days_before_due?: number | null;
  /**
   * Antecipação só para assinaturas weekly.
   * `null` = herda `recurring_invoice_generate_days_before_due`.
   */
  recurring_invoice_generate_days_before_due_weekly?: number | null;
  defaults?: {
    timezone: string;
    recurring_generate_time_local: string;
    invoice_notify_same_as_generation: boolean;
    invoice_notify_time_local: string | null;
    recurring_invoice_generate_days_before_due: number;
    recurring_invoice_generate_days_before_due_weekly?: number | null;
  };
  sources?: {
    timezone: 'tenant' | 'fallback_default';
    recurring_generate_time_local: 'tenant' | 'fallback_default';
    invoice_notify_same_as_generation: 'tenant' | 'fallback_default';
    invoice_notify_time_local: 'tenant' | 'derived_from_generation' | 'fallback_default';
    recurring_invoice_generate_days_before_due: 'tenant' | 'fallback_default';
    recurring_invoice_generate_days_before_due_weekly?: 'tenant' | 'inherited_general';
  };
  effective?: {
    timezone: string;
    recurring_generate_time_local: string;
    invoice_notify_same_as_generation: boolean;
    invoice_notify_time_local: string | null;
    recurring_invoice_generate_days_before_due: number;
    recurring_invoice_generate_days_before_due_weekly?: number | null;
  };
  message?: string;
}

export interface PutTenantBillingPreferencesBody {
  timezone: string | null;
  recurring_generate_time_local: string;
  invoice_notify_same_as_generation: boolean;
  invoice_notify_time_local?: string | null;
  recurring_invoice_generate_days_before_due: number;
  /**
   * Omisso = não altera (clientes antigos).
   * `null` = herdar antecipação geral.
   * número = valor semanal (0–60).
   */
  recurring_invoice_generate_days_before_due_weekly?: number | null;
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
