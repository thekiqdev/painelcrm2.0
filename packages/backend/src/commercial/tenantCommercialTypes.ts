export type TenantCommercialBillingInterval =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'yearly';

export const TENANT_COMMERCIAL_OVERRIDE_TYPES = [
  'fixed_price',
  'percent_discount',
  'amount_discount',
  'waive',
] as const;

export type TenantCommercialOverrideType = (typeof TENANT_COMMERCIAL_OVERRIDE_TYPES)[number];

export type TenantCommercialPriceContext =
  | 'checkout'
  | 'renewal'
  | 'seat_addon'
  | 'manual_charge';

export type TenantCommercialOverrideRow = {
  id: string;
  tenant_id: string;
  plan_id: string | null;
  billing_interval: TenantCommercialBillingInterval | null;
  override_type: TenantCommercialOverrideType;
  value_cents: number | null;
  percent_off: number | null;
  valid_from: Date | string;
  valid_until: Date | string | null;
  reason: string | null;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

export type ResolveTenantCommercialPriceInput = {
  tenantId: string;
  planId: string;
  billingInterval: TenantCommercialBillingInterval;
  catalogAmountCents: number;
  context: TenantCommercialPriceContext;
  at?: Date;
};

export type TenantCommercialPriceSource = 'catalog' | 'tenant_override';

export type ResolveTenantCommercialPriceResult = {
  finalAmountCents: number;
  source: TenantCommercialPriceSource;
  overrideId: string | null;
  overrideType: TenantCommercialOverrideType | null;
};
