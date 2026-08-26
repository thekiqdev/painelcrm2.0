/**
 * M5 S8 — predicado de “cliente Platform” (venda direta).
 * Não usar só `partner_id IS NULL` (incluiria o tenant `partner`).
 */

export const PLATFORM_CUSTOMER_ACCOUNT_TYPE = 'platform_customer' as const;

export function isAllTenantsScope(raw: unknown): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === 'all' || v === '1' || v === 'true';
}

/** SQL: tenant é cliente da venda direta (lista/métricas SaaS). */
export const SQL_TENANT_IS_PLATFORM_CUSTOMER = `account_type = '${PLATFORM_CUSTOMER_ACCOUNT_TYPE}'`;

/** Alias `t.` — dashboard, MRR catálogo, analytics. */
export const SQL_T_IS_PLATFORM_CUSTOMER = `t.${SQL_TENANT_IS_PLATFORM_CUSTOMER}`;

/** Alias `pt.` — JOIN de users → tenants (crescimento / recentes). */
export const SQL_PT_IS_PLATFORM_CUSTOMER = `pt.${SQL_TENANT_IS_PLATFORM_CUSTOMER}`;

/** Subscriptions SaaS cujo tenant é cliente Platform (não canal). */
export const SQL_SUBSCRIPTION_TENANT_IS_PLATFORM_CUSTOMER = `EXISTS (
  SELECT 1 FROM tenants pt
  WHERE pt.id = s.tenant_id AND ${SQL_PT_IS_PLATFORM_CUSTOMER}
)`;

