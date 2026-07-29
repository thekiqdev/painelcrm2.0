/**
 * CRM1 — store Pix Automático em subscriptions type=customer.
 * Reusa tipos/helpers públicos do store SaaS; escrita/leitura filtrada por type=customer.
 */
import { pool } from '../../utils/db.js';
import {
  toPublicPixAutomaticStatus,
  type PixAutomaticAuthRow,
  type PixAutomaticAuthStatus,
} from '../billing2/billingPixAutomaticStore.js';

export type { PixAutomaticAuthRow, PixAutomaticAuthStatus };
export { toPublicPixAutomaticStatus };

function mapRow(row: Record<string, unknown>): PixAutomaticAuthRow {
  return {
    subscription_id: String(row.subscription_id),
    tenant_id: String(row.tenant_id),
    authorization_id: row.authorization_id != null ? String(row.authorization_id) : null,
    status: (row.status as PixAutomaticAuthStatus) ?? null,
    gateway: row.gateway != null ? String(row.gateway) : null,
    authorized_at: row.authorized_at != null ? String(row.authorized_at) : null,
    cancelled_at: row.cancelled_at != null ? String(row.cancelled_at) : null,
    contract_id: row.contract_id != null ? String(row.contract_id) : null,
    qr_payload: row.qr_payload != null ? String(row.qr_payload) : null,
    qr_image: row.qr_image != null ? String(row.qr_image) : null,
    conciliation_id: row.conciliation_id != null ? String(row.conciliation_id) : null,
  };
}

const SELECT_AUTH = `
  id::text AS subscription_id,
  tenant_id::text AS tenant_id,
  pix_automatic_authorization_id AS authorization_id,
  pix_automatic_auth_status AS status,
  pix_automatic_auth_gateway AS gateway,
  pix_automatic_authorized_at::text AS authorized_at,
  pix_automatic_cancelled_at::text AS cancelled_at,
  pix_automatic_contract_id AS contract_id,
  pix_automatic_qr_payload AS qr_payload,
  pix_automatic_qr_image AS qr_image,
  pix_automatic_conciliation_id AS conciliation_id
`;

export async function getCrmPixAutomaticAuthBySubscriptionId(
  subscriptionId: string
): Promise<PixAutomaticAuthRow | null> {
  const r = await pool.query(
    `SELECT ${SELECT_AUTH}
     FROM subscriptions
     WHERE id = $1::uuid AND type = 'customer'
     LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row);
}

/** Preferência/auth da assinatura CRM do cliente (tenant + client). */
export async function getCrmPixAutomaticAuthByTenantClient(opts: {
  tenantId: string;
  clientId: string;
}): Promise<PixAutomaticAuthRow | null> {
  const r = await pool.query(
    `SELECT ${SELECT_AUTH}
     FROM subscriptions
     WHERE tenant_id = $1::uuid
       AND type = 'customer'
       AND customer_id = $2::uuid
       AND status IN ('active', 'past_due', 'trialing', 'paused')
     ORDER BY
       CASE WHEN pix_automatic_auth_status = 'active' THEN 0
            WHEN pix_automatic_auth_status = 'pending' THEN 1
            ELSE 2 END,
       updated_at DESC
     LIMIT 1`,
    [opts.tenantId, opts.clientId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row);
}

export async function getCrmSubscriptionByPixAuthorizationId(
  authorizationId: string
): Promise<PixAutomaticAuthRow | null> {
  const r = await pool.query(
    `SELECT ${SELECT_AUTH}
     FROM subscriptions
     WHERE pix_automatic_authorization_id = $1
       AND type = 'customer'
     LIMIT 1`,
    [authorizationId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row);
}

export async function upsertCrmPixAutomaticAuthorization(opts: {
  subscriptionId: string;
  tenantId: string;
  authorizationId: string;
  status: PixAutomaticAuthStatus;
  gateway?: string;
  contractId?: string | null;
  qrPayload?: string | null;
  qrImage?: string | null;
  conciliationId?: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE subscriptions
     SET
       pix_automatic_authorization_id = $1,
       pix_automatic_auth_status = $2,
       pix_automatic_auth_gateway = COALESCE($3, pix_automatic_auth_gateway, 'asaas'),
       pix_automatic_contract_id = COALESCE($4, pix_automatic_contract_id),
       pix_automatic_qr_payload = $5,
       pix_automatic_qr_image = $6,
       pix_automatic_conciliation_id = COALESCE($7, pix_automatic_conciliation_id),
       pix_automatic_authorized_at = CASE
         WHEN $2 = 'active' THEN COALESCE(pix_automatic_authorized_at, now())
         ELSE pix_automatic_authorized_at
       END,
       pix_automatic_cancelled_at = CASE
         WHEN $2 IN ('cancelled', 'expired', 'refused', 'cleared') THEN now()
         WHEN $2 IN ('pending', 'active') THEN NULL
         ELSE pix_automatic_cancelled_at
       END,
       updated_at = now()
     WHERE id = $8::uuid AND tenant_id = $9::uuid AND type = 'customer'`,
    [
      opts.authorizationId,
      opts.status,
      opts.gateway ?? 'asaas',
      opts.contractId ?? null,
      opts.status === 'pending' ? opts.qrPayload ?? null : null,
      opts.status === 'pending' ? opts.qrImage ?? null : null,
      opts.conciliationId ?? null,
      opts.subscriptionId,
      opts.tenantId,
    ]
  );
}

export async function updateCrmPixAutomaticAuthStatus(opts: {
  authorizationId: string;
  status: PixAutomaticAuthStatus;
}): Promise<PixAutomaticAuthRow | null> {
  await pool.query(
    `UPDATE subscriptions
     SET
       pix_automatic_auth_status = $2,
       pix_automatic_authorized_at = CASE
         WHEN $2 = 'active' THEN COALESCE(pix_automatic_authorized_at, now())
         ELSE pix_automatic_authorized_at
       END,
       pix_automatic_cancelled_at = CASE
         WHEN $2 IN ('cancelled', 'expired', 'refused', 'cleared') THEN now()
         WHEN $2 IN ('pending', 'active') THEN NULL
         ELSE pix_automatic_cancelled_at
       END,
       pix_automatic_qr_payload = CASE WHEN $2 = 'active' THEN NULL ELSE pix_automatic_qr_payload END,
       pix_automatic_qr_image = CASE WHEN $2 = 'active' THEN NULL ELSE pix_automatic_qr_image END,
       updated_at = now()
     WHERE pix_automatic_authorization_id = $1
       AND type = 'customer'`,
    [opts.authorizationId, opts.status]
  );
  return getCrmSubscriptionByPixAuthorizationId(opts.authorizationId);
}

/** Opt-out persistido (`cleared`) — default ON / auto-enable não reaplica. */
export async function markCrmPixAutomaticUserOptedOut(opts: {
  subscriptionId: string;
  tenantId: string;
}): Promise<PixAutomaticAuthRow | null> {
  await pool.query(
    `UPDATE subscriptions
     SET
       pix_automatic_auth_status = 'cleared',
       pix_automatic_cancelled_at = now(),
       pix_automatic_qr_payload = NULL,
       pix_automatic_qr_image = NULL,
       updated_at = now()
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'customer'`,
    [opts.subscriptionId, opts.tenantId]
  );
  return getCrmPixAutomaticAuthBySubscriptionId(opts.subscriptionId);
}
