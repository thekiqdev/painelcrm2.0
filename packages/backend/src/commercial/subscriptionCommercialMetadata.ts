/**
 * Sprint M4.1 — origem comercial na assinatura SaaS (subscriptions.metadata).
 */
import { resolveTenantCommercialPrice } from './tenantCommercialOverrideService.js';
import type { TenantCommercialBillingInterval } from './tenantCommercialTypes.js';
import { pool } from '../utils/db.js';
import type { TenantBillingRow } from '../services/invoiceService.js';
import { calculateInvoiceAmount, type BillingInterval } from '../services/billingService.js';

export type SubscriptionCommercialSource =
  | 'catalog'
  | 'waive'
  | 'tenant_override'
  | 'zero_amount';

export type SubscriptionCommercialMetadata = {
  commercial_source: SubscriptionCommercialSource;
  activation_type: 'zero_amount' | 'paid';
  override_id?: string | null;
  override_type?: string | null;
  billing_id: string;
  updated_at: string;
};

function parseGatewayMetadata(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function isZeroAmountSettlement(meta: Record<string, unknown>): boolean {
  return meta.settlement_source === 'zero_amount';
}

export async function resolveCommercialMetadataFromPaidBilling(
  billing: TenantBillingRow,
): Promise<SubscriptionCommercialMetadata> {
  const gatewayMeta = parseGatewayMetadata(billing.gateway_metadata);
  const billingInterval = (billing.billing_interval ?? 'monthly') as BillingInterval;
  const usersCount = billing.users_count ?? null;
  const catalogAmount = await calculateInvoiceAmount(billing.plan_id, billingInterval, usersCount);

  const resolved = await resolveTenantCommercialPrice({
    tenantId: billing.tenant_id,
    planId: billing.plan_id,
    billingInterval: billingInterval as TenantCommercialBillingInterval,
    catalogAmountCents: catalogAmount,
    context: 'renewal',
  });

  const activationType: SubscriptionCommercialMetadata['activation_type'] =
    billing.amount_cents === 0 || isZeroAmountSettlement(gatewayMeta) ? 'zero_amount' : 'paid';

  let commercialSource: SubscriptionCommercialSource = 'catalog';

  if (resolved.overrideType === 'waive' || gatewayMeta.override_type === 'waive') {
    commercialSource = 'waive';
  } else if (resolved.source === 'tenant_override') {
    commercialSource = 'tenant_override';
  } else if (activationType === 'zero_amount') {
    commercialSource = 'zero_amount';
  }

  return {
    commercial_source: commercialSource,
    activation_type: activationType,
    override_id: resolved.overrideId,
    override_type: resolved.overrideType ?? (gatewayMeta.override_type as string | null) ?? null,
    billing_id: billing.id,
    updated_at: new Date().toISOString(),
  };
}

export async function persistSubscriptionCommercialMetadata(input: {
  subscriptionId: string;
  tenantId: string;
  metadata: SubscriptionCommercialMetadata;
}): Promise<void> {
  await pool.query(
    `UPDATE subscriptions
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
     WHERE id = $2::uuid
       AND tenant_id = $3::uuid
       AND type = 'saas'
       AND status = 'active'`,
    [JSON.stringify({ commercial: input.metadata }), input.subscriptionId, input.tenantId],
  );
}

export async function applySubscriptionCommercialMetadataFromPaidBilling(input: {
  subscriptionId: string;
  tenantId: string;
  billing: TenantBillingRow;
}): Promise<SubscriptionCommercialMetadata> {
  const metadata = await resolveCommercialMetadataFromPaidBilling(input.billing);
  await persistSubscriptionCommercialMetadata({
    subscriptionId: input.subscriptionId,
    tenantId: input.tenantId,
    metadata,
  });
  return metadata;
}
