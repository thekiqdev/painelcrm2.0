/**
 * Billing 2.0 Sprint 9 — store de token de cartão (gateway-safe) em subscriptions SaaS.
 * Nunca persiste PAN/CVV. Não loga o token completo.
 */
import { pool } from '../../utils/db.js';

export type SaasCardTokenStatus = 'active' | 'invalid' | 'replaced' | 'cleared';

export type SaasCardTokenRow = {
  subscription_id: string;
  tenant_id: string;
  card_token: string;
  card_brand: string | null;
  card_last4: string | null;
  card_token_gateway: string | null;
  card_tokenized_at: string | null;
  card_token_status: SaasCardTokenStatus | null;
};

function maskToken(token: string): string {
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function cardTokenAuditSafe(token: string | null | undefined): string | null {
  if (!token) return null;
  return maskToken(token);
}

export async function getActiveSaasCardTokenBySubscriptionId(
  subscriptionId: string
): Promise<SaasCardTokenRow | null> {
  const r = await pool.query(
    `SELECT
       id::text AS subscription_id,
       tenant_id::text AS tenant_id,
       card_token,
       card_brand,
       card_last4,
       card_token_gateway,
       card_tokenized_at::text,
       card_token_status
     FROM subscriptions
     WHERE id = $1::uuid
       AND type = 'saas'
       AND card_token IS NOT NULL
       AND NULLIF(BTRIM(card_token), '') IS NOT NULL
       AND COALESCE(card_token_status, 'active') = 'active'
     LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0];
  if (!row?.card_token) return null;
  return {
    subscription_id: String(row.subscription_id),
    tenant_id: String(row.tenant_id),
    card_token: String(row.card_token),
    card_brand: row.card_brand != null ? String(row.card_brand) : null,
    card_last4: row.card_last4 != null ? String(row.card_last4) : null,
    card_token_gateway: row.card_token_gateway != null ? String(row.card_token_gateway) : null,
    card_tokenized_at: row.card_tokenized_at != null ? String(row.card_tokenized_at) : null,
    card_token_status: (row.card_token_status as SaasCardTokenStatus) ?? 'active',
  };
}

export async function getActiveSaasCardTokenByTenantId(
  tenantId: string
): Promise<SaasCardTokenRow | null> {
  const r = await pool.query(
    `SELECT
       id::text AS subscription_id,
       tenant_id::text AS tenant_id,
       card_token,
       card_brand,
       card_last4,
       card_token_gateway,
       card_tokenized_at::text,
       card_token_status
     FROM subscriptions
     WHERE tenant_id = $1::uuid
       AND type = 'saas'
       AND status IN ('active', 'past_due', 'trialing')
       AND card_token IS NOT NULL
       AND NULLIF(BTRIM(card_token), '') IS NOT NULL
       AND COALESCE(card_token_status, 'active') = 'active'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row?.card_token) return null;
  return {
    subscription_id: String(row.subscription_id),
    tenant_id: String(row.tenant_id),
    card_token: String(row.card_token),
    card_brand: row.card_brand != null ? String(row.card_brand) : null,
    card_last4: row.card_last4 != null ? String(row.card_last4) : null,
    card_token_gateway: row.card_token_gateway != null ? String(row.card_token_gateway) : null,
    card_tokenized_at: row.card_tokenized_at != null ? String(row.card_tokenized_at) : null,
    card_token_status: (row.card_token_status as SaasCardTokenStatus) ?? 'active',
  };
}

export async function upsertSaasCardToken(opts: {
  subscriptionId: string;
  tenantId: string;
  cardToken: string;
  cardBrand?: string | null;
  cardLast4?: string | null;
  gateway?: string | null;
}): Promise<void> {
  const token = opts.cardToken.trim();
  if (!token) return;
  const last4 = opts.cardLast4?.replace(/\D/g, '').slice(-4) || null;
  await pool.query(
    `UPDATE subscriptions
     SET
       card_token = $1,
       card_brand = $2,
       card_last4 = $3,
       card_token_gateway = COALESCE($4, card_token_gateway, 'asaas'),
       card_tokenized_at = now(),
       card_token_status = 'active',
       default_payment_method = COALESCE(default_payment_method, 'CREDIT_CARD'),
       updated_at = now()
     WHERE id = $5::uuid
       AND tenant_id = $6::uuid
       AND type = 'saas'`,
    [token, opts.cardBrand ?? null, last4, opts.gateway ?? 'asaas', opts.subscriptionId, opts.tenantId]
  );
}

export async function markSaasCardTokenInvalid(subscriptionId: string, reason?: string): Promise<void> {
  await pool.query(
    `UPDATE subscriptions
     SET card_token_status = 'invalid', updated_at = now()
     WHERE id = $1::uuid AND type = 'saas'`,
    [subscriptionId]
  );
  void reason;
}

export async function clearSaasCardToken(subscriptionId: string): Promise<void> {
  await pool.query(
    `UPDATE subscriptions
     SET
       card_token = NULL,
       card_brand = NULL,
       card_last4 = NULL,
       card_token_status = 'cleared',
       updated_at = now()
     WHERE id = $1::uuid AND type = 'saas'`,
    [subscriptionId]
  );
}

/** Display público — sem token. */
export function toPublicSavedCard(row: SaasCardTokenRow | null): {
  brand: string | null;
  last4: string | null;
  gateway: string | null;
} | null {
  if (!row) return null;
  return {
    brand: row.card_brand,
    last4: row.card_last4,
    gateway: row.card_token_gateway,
  };
}

export async function countCardCaptureFailures(days = 30): Promise<number> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM billing_audit_events
     WHERE action = 'card.capture_failed'
       AND created_at >= now() - ($1::int * interval '1 day')`,
    [Math.min(365, Math.max(1, days))]
  );
  return Number.parseInt(r.rows[0]?.c ?? '0', 10) || 0;
}
