/**
 * Billing 2.0 Sprint 10 — store de autorização Pix Automático em subscriptions SaaS.
 */
import { pool } from '../../utils/db.js';

export type PixAutomaticAuthStatus =
  | 'pending'
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'refused'
  | 'cleared';

export type PixAutomaticAuthRow = {
  subscription_id: string;
  tenant_id: string;
  authorization_id: string | null;
  status: PixAutomaticAuthStatus | null;
  gateway: string | null;
  authorized_at: string | null;
  cancelled_at: string | null;
  contract_id: string | null;
  qr_payload: string | null;
  qr_image: string | null;
  conciliation_id: string | null;
};

export function toPublicPixAutomaticStatus(row: PixAutomaticAuthRow | null): {
  status: PixAutomaticAuthStatus | null;
  has_active: boolean;
  qr_payload: string | null;
  qr_image: string | null;
  gateway: string | null;
} | null {
  if (!row) return null;
  const rawImage = row.status === 'pending' ? row.qr_image : null;
  const qr_image =
    rawImage == null || rawImage === ''
      ? null
      : rawImage.startsWith('data:')
        ? rawImage
        : `data:image/png;base64,${rawImage}`;
  return {
    status: row.status,
    has_active: row.status === 'active' && !!row.authorization_id,
    qr_payload: row.status === 'pending' ? row.qr_payload : null,
    qr_image,
    gateway: row.gateway,
  };
}

export async function getPixAutomaticAuthBySubscriptionId(
  subscriptionId: string
): Promise<PixAutomaticAuthRow | null> {
  const r = await pool.query(
    `SELECT
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
     FROM subscriptions
     WHERE id = $1::uuid AND type = 'saas'
     LIMIT 1`,
    [subscriptionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row);
}

export async function getPixAutomaticAuthByTenantId(
  tenantId: string
): Promise<PixAutomaticAuthRow | null> {
  const r = await pool.query(
    `SELECT
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
     FROM subscriptions
     WHERE tenant_id = $1::uuid
       AND type = 'saas'
       AND status IN ('active', 'past_due', 'trialing')
     ORDER BY
       CASE WHEN pix_automatic_auth_status = 'active' THEN 0
            WHEN pix_automatic_auth_status = 'pending' THEN 1
            ELSE 2 END,
       updated_at DESC
     LIMIT 1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row);
}

export async function getSubscriptionByPixAuthorizationId(
  authorizationId: string
): Promise<PixAutomaticAuthRow | null> {
  const r = await pool.query(
    `SELECT
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
     FROM subscriptions
     WHERE pix_automatic_authorization_id = $1
     LIMIT 1`,
    [authorizationId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row);
}

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

export async function upsertPixAutomaticAuthorization(opts: {
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
     WHERE id = $8::uuid AND tenant_id = $9::uuid AND type = 'saas'`,
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

export async function updatePixAutomaticAuthStatus(opts: {
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
     WHERE pix_automatic_authorization_id = $1`,
    [opts.authorizationId, opts.status]
  );
  return getSubscriptionByPixAuthorizationId(opts.authorizationId);
}

/**
 * Sprint C — usuário desligou o switch (mesmo sem auth no Asaas).
 * Status `cleared` = opt-out persistido; default ON / auto-enable não reaplica.
 */
export async function markPixAutomaticUserOptedOut(opts: {
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
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'saas'`,
    [opts.subscriptionId, opts.tenantId]
  );
  return getPixAutomaticAuthBySubscriptionId(opts.subscriptionId);
}

/**
 * Dias úteis (seg–sex) entre fromYmd (exclusive) e dueYmd (inclusive-ish).
 * Usado para janela 2–10 dias úteis antes do vencimento (Asaas).
 */
export function countBusinessDaysUntil(dueYmd: string, fromYmd?: string): number {
  const from = fromYmd ? Date.parse(`${fromYmd}T00:00:00Z`) : Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const to = Date.parse(`${dueYmd}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  let days = 0;
  let cur = from + 24 * 60 * 60 * 1000;
  while (cur <= to) {
    const dow = new Date(cur).getUTCDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cur += 24 * 60 * 60 * 1000;
  }
  return days;
}

export function isWithinPixAutomaticInstructionWindow(dueYmd: string, fromYmd?: string): boolean {
  const n = countBusinessDaysUntil(dueYmd, fromYmd);
  return n >= 2 && n <= 10;
}

export function mapBillingIntervalToPixFrequency(
  interval: string | null | undefined
): 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'ANNUALLY' {
  switch ((interval ?? 'monthly').toLowerCase()) {
    case 'weekly':
      return 'WEEKLY';
    case 'quarterly':
      return 'QUARTERLY';
    case 'semi_annual':
      return 'SEMIANNUALLY';
    case 'yearly':
      return 'ANNUALLY';
    default:
      return 'MONTHLY';
  }
}
