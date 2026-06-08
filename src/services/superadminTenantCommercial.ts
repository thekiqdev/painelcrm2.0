import { apiClient } from '@/integrations/api/client';

export type CommercialOverrideType = 'fixed_price' | 'percent_discount' | 'amount_discount' | 'waive';

export type CommercialOverrideStatus = 'active' | 'expired' | 'disabled';

export type CommercialOverrideItem = {
  id: string;
  tenant_id: string;
  plan_id: string | null;
  billing_interval: string | null;
  override_type: CommercialOverrideType;
  value_cents: number | null;
  percent_off: number | null;
  valid_from: string;
  valid_until: string | null;
  reason: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  status: CommercialOverrideStatus;
  catalog_price_cents: number;
  final_price_cents: number;
};

export type TenantCommercialSummary = {
  tenant: { id: string; name: string; status: string; plan_id: string };
  plan: { id: string; name: string; slug: string; plan_type: string; price_cents: number | null };
  billing_interval: string;
  catalog_price_cents: number;
  effective_price_cents: number;
  price_source: 'Catálogo' | 'Override Comercial';
  active_override: CommercialOverrideItem | null;
  simulation: {
    catalog_price_cents: number;
    override_applied: boolean;
    override_type: CommercialOverrideType | null;
    override_id: string | null;
    final_price_cents: number;
    discount_cents: number;
    source: string;
  };
};

export type CommercialOverrideInput = {
  override_type: CommercialOverrideType;
  value_cents?: number | null;
  percent_off?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
  reason?: string | null;
  plan_id?: string | null;
  billing_interval?: string | null;
};

export function formatBrlCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function fetchTenantCommercialSummary(tenantId: string) {
  const res = await apiClient.get<TenantCommercialSummary>(`/api/superadmin/tenants/${tenantId}/commercial`);
  return res;
}

export async function fetchTenantCommercialOverrides(tenantId: string) {
  const res = await apiClient.get<{ items: CommercialOverrideItem[]; catalog_price_cents: number }>(
    `/api/superadmin/tenants/${tenantId}/commercial/overrides`,
  );
  return res;
}

export async function createTenantCommercialOverride(tenantId: string, body: CommercialOverrideInput) {
  return apiClient.post<{ ok: boolean; override: CommercialOverrideItem }>(
    `/api/superadmin/tenants/${tenantId}/commercial/overrides`,
    body,
  );
}

export async function patchTenantCommercialOverride(
  tenantId: string,
  overrideId: string,
  body: Partial<CommercialOverrideInput>,
) {
  return apiClient.patch<{ ok: boolean; override: CommercialOverrideItem }>(
    `/api/superadmin/tenants/${tenantId}/commercial/overrides/${overrideId}`,
    body,
  );
}

export async function disableTenantCommercialOverride(tenantId: string, overrideId: string) {
  return apiClient.delete<{ ok: boolean; override: CommercialOverrideItem }>(
    `/api/superadmin/tenants/${tenantId}/commercial/overrides/${overrideId}`,
  );
}

export async function simulateTenantCommercialPrice(tenantId: string, body?: Partial<CommercialOverrideInput>) {
  return apiClient.post<{ ok: boolean; simulation: TenantCommercialSummary['simulation'] }>(
    `/api/superadmin/tenants/${tenantId}/commercial/simulate`,
    body ?? {},
  );
}

export const OVERRIDE_TYPE_LABELS: Record<CommercialOverrideType, string> = {
  fixed_price: 'Preço fixo',
  percent_discount: 'Desconto percentual',
  amount_discount: 'Desconto em valor',
  waive: 'Isenção total',
};

export const OVERRIDE_STATUS_LABELS: Record<CommercialOverrideStatus, string> = {
  active: 'Ativo',
  expired: 'Expirado',
  disabled: 'Desativado',
};
