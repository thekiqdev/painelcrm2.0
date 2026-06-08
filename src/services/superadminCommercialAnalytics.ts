import { apiClient } from '@/integrations/api/client';

export type CommercialBreakdownCategoryKey =
  | 'catalog_price'
  | 'percent_discount'
  | 'fixed_discount'
  | 'free_partners'
  | 'white_labels';

export type CommercialBreakdownRow = {
  category: string;
  category_key: CommercialBreakdownCategoryKey;
  count: number;
  total_cents: number;
};

export type CommercialMetrics = {
  mrrCatalog: number;
  mrrContracted: number;
  monthlyRevenue: number;
  commercialImpact: number;
  activeOverrides: number;
  waivedTenants: number;
  breakdown: CommercialBreakdownRow[];
};

export type CommercialOverrideReportRow = {
  tenant_id: string;
  tenant_name: string;
  plan_name: string;
  catalog_mrr_cents: number;
  effective_mrr_cents: number;
  override_type: string | null;
  monthly_savings_cents: number;
};

export type CommercialOverridesReportResponse = {
  items: CommercialOverrideReportRow[];
};

export function formatBrlCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function fetchCommercialMetrics(): Promise<{
  data: CommercialMetrics | null;
  error: string | null;
}> {
  const res = await apiClient.get<CommercialMetrics>('/api/superadmin/commercial/metrics');
  if (res.error) return { data: null, error: res.error };
  return { data: res.data ?? null, error: null };
}

export async function fetchCommercialOverridesReport(): Promise<{
  data: CommercialOverridesReportResponse | null;
  error: string | null;
}> {
  const res = await apiClient.get<CommercialOverridesReportResponse>(
    '/api/superadmin/commercial/overrides/report',
  );
  if (res.error) return { data: null, error: res.error };
  return { data: res.data ?? null, error: null };
}
