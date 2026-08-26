/**
 * Listagem global somente leitura: cobranças SaaS (tenant_billing) para Super Admin.
 */
import { pool } from '../utils/db.js';
import { SQL_T_IS_PLATFORM_CUSTOMER } from '../partner/superadminTenantListScope.js';
import { pickGatewayFallbackUrlFromBilling } from './saasBillingLinkHelpers.js';
import { buildPlatformSaasInvoiceUrl } from '../utils/saasPlatformInvoiceUrl.js';
import type { TenantBillingRow } from './invoiceService.js';
import { isValidPlatformPublicPayTokenFormat } from './invoiceService.js';

export type SuperadminPlatformBillingListRow = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  plan_id: string;
  plan_name: string | null;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  invoice_number: string | null;
  gateway: string | null;
  payment_method: string | null;
  gateway_reference_id: string | null;
  billing_reason: string | null;
  created_at: string;
  has_public_pay_link: boolean;
  has_gateway_fallback_link: boolean;
  platform_invoice_url: string | null;
  gateway_fallback_url: string | null;
};

export type ListPlatformBillingsParams = {
  status?: string | null;
  tenantId?: string | null;
  from?: string | null;
  to?: string | null;
  limit: number;
  offset: number;
};

function clampLimit(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(100, Math.floor(n));
}

export async function listSuperadminPlatformBillings(
  params: ListPlatformBillingsParams,
): Promise<{ rows: SuperadminPlatformBillingListRow[]; total: number }> {
  const limit = clampLimit(params.limit);
  const offset = Math.max(0, Math.floor(params.offset));

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let i = 1;

  if (params.status?.trim()) {
    conditions.push(`tb.status = $${i++}`);
    values.push(params.status.trim());
  }
  if (params.tenantId?.trim()) {
    conditions.push(`tb.tenant_id = $${i++}::uuid`);
    values.push(params.tenantId.trim());
  }
  if (params.from?.trim()) {
    conditions.push(`tb.created_at >= $${i++}::date`);
    values.push(params.from.trim());
  }
  if (params.to?.trim()) {
    conditions.push(`tb.created_at < ($${i++}::date + interval '1 day')`);
    values.push(params.to.trim());
  }

  const whereSql = conditions.join(' AND ');

  const countR = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c
     FROM tenant_billing tb
     INNER JOIN tenants t ON t.id = tb.tenant_id AND ${SQL_T_IS_PLATFORM_CUSTOMER}
     WHERE ${whereSql}`,
    values,
  );
  const total = parseInt(countR.rows[0]?.c ?? '0', 10) || 0;

  values.push(limit, offset);
  const limIdx = i++;
  const offIdx = i;

  const r = await pool.query<
    SuperadminPlatformBillingListRow & {
      platform_public_pay_token: string | null;
      gateway_metadata: TenantBillingRow['gateway_metadata'];
    }
  >(
    `SELECT
       tb.id,
       tb.tenant_id,
       t.name AS tenant_name,
       tb.plan_id,
       p.name AS plan_name,
       tb.amount_cents,
       tb.due_date::text AS due_date,
       tb.status,
       tb.paid_at::text AS paid_at,
       tb.invoice_number,
       tb.gateway,
       tb.payment_method,
       tb.gateway_reference_id,
       tb.billing_reason,
       tb.created_at::text AS created_at,
       tb.platform_public_pay_token,
       tb.gateway_metadata
     FROM tenant_billing tb
     INNER JOIN tenants t ON t.id = tb.tenant_id AND ${SQL_T_IS_PLATFORM_CUSTOMER}
     LEFT JOIN plans p ON p.id = tb.plan_id
     WHERE ${whereSql}
     ORDER BY tb.created_at DESC, tb.id DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    values,
  );

  const rows: SuperadminPlatformBillingListRow[] = r.rows.map((row) => {
    const tok = row.platform_public_pay_token?.trim();
    const hasPublic = Boolean(tok && isValidPlatformPublicPayTokenFormat(tok));
    const stub: TenantBillingRow = {
      id: row.id,
      tenant_id: row.tenant_id,
      plan_id: row.plan_id,
      billing_interval: '',
      amount_cents: row.amount_cents,
      due_date: row.due_date,
      status: row.status,
      paid_at: row.paid_at,
      invoice_number: row.invoice_number,
      gateway: row.gateway,
      payment_method: row.payment_method,
      gateway_reference_id: row.gateway_reference_id,
      gateway_metadata: row.gateway_metadata,
      gateway_status: null,
      idempotency_key: null,
      period_start: null,
      period_end: null,
      subscription_id: null,
      plan_name_snapshot: null,
      plan_price_snapshot: null,
      users_count: null,
      source: null,
      billing_reason: row.billing_reason,
      created_at: row.created_at,
      updated_at: row.created_at,
      platform_public_pay_token: row.platform_public_pay_token,
    };
    const gatewayFallback = pickGatewayFallbackUrlFromBilling(stub);
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      tenant_name: row.tenant_name,
      plan_id: row.plan_id,
      plan_name: row.plan_name,
      amount_cents: row.amount_cents,
      due_date: row.due_date,
      status: row.status,
      paid_at: row.paid_at,
      invoice_number: row.invoice_number,
      gateway: row.gateway,
      payment_method: row.payment_method,
      gateway_reference_id: row.gateway_reference_id,
      billing_reason: row.billing_reason,
      created_at: row.created_at,
      has_public_pay_link: hasPublic,
      has_gateway_fallback_link: gatewayFallback.length > 0,
      platform_invoice_url: hasPublic && tok ? buildPlatformSaasInvoiceUrl(tok) : null,
      gateway_fallback_url: gatewayFallback || null,
    };
  });

  return { rows, total };
}

export async function getSuperadminPlatformBillingDetail(
  billingId: string,
): Promise<SuperadminPlatformBillingListRow | null> {
  const r = await pool.query<
    SuperadminPlatformBillingListRow & {
      platform_public_pay_token: string | null;
      gateway_metadata: TenantBillingRow['gateway_metadata'];
    }
  >(
    `SELECT
       tb.id,
       tb.tenant_id,
       t.name AS tenant_name,
       tb.plan_id,
       p.name AS plan_name,
       tb.amount_cents,
       tb.due_date::text AS due_date,
       tb.status,
       tb.paid_at::text AS paid_at,
       tb.invoice_number,
       tb.gateway,
       tb.payment_method,
       tb.gateway_reference_id,
       tb.billing_reason,
       tb.created_at::text AS created_at,
       tb.platform_public_pay_token,
       tb.gateway_metadata
     FROM tenant_billing tb
     INNER JOIN tenants t ON t.id = tb.tenant_id
     LEFT JOIN plans p ON p.id = tb.plan_id
     WHERE tb.id = $1::uuid
     LIMIT 1`,
    [billingId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const tok = row.platform_public_pay_token?.trim();
  const hasPublic = Boolean(tok && isValidPlatformPublicPayTokenFormat(tok));
  const stub: TenantBillingRow = {
    id: row.id,
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    billing_interval: '',
    amount_cents: row.amount_cents,
    due_date: row.due_date,
    status: row.status,
    paid_at: row.paid_at,
    invoice_number: row.invoice_number,
    gateway: row.gateway,
    payment_method: row.payment_method,
    gateway_reference_id: row.gateway_reference_id,
    gateway_metadata: row.gateway_metadata,
    gateway_status: null,
    idempotency_key: null,
    period_start: null,
    period_end: null,
    subscription_id: null,
    plan_name_snapshot: null,
    plan_price_snapshot: null,
    users_count: null,
    source: null,
    billing_reason: row.billing_reason,
    created_at: row.created_at,
    updated_at: row.created_at,
    platform_public_pay_token: row.platform_public_pay_token,
  };
  const gatewayFallback = pickGatewayFallbackUrlFromBilling(stub);
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    tenant_name: row.tenant_name,
    plan_id: row.plan_id,
    plan_name: row.plan_name,
    amount_cents: row.amount_cents,
    due_date: row.due_date,
    status: row.status,
    paid_at: row.paid_at,
    invoice_number: row.invoice_number,
    gateway: row.gateway,
    payment_method: row.payment_method,
    gateway_reference_id: row.gateway_reference_id,
    billing_reason: row.billing_reason,
    created_at: row.created_at,
    has_public_pay_link: hasPublic,
    has_gateway_fallback_link: gatewayFallback.length > 0,
    platform_invoice_url: hasPublic && tok ? buildPlatformSaasInvoiceUrl(tok) : null,
    gateway_fallback_url: gatewayFallback || null,
  };
}
