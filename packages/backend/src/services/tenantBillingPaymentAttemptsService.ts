/**
 * Tentativas de pagamento por tenant_billing (checkout SaaS) — espelha o papel de
 * customerInvoicePaymentAttemptsService no link público de faturas.
 */
import { pool } from '../utils/db.js';

export type TbAttemptPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';
export type TbAttemptStatus =
  | 'pending'
  | 'waiting_payment'
  | 'processing'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'failed'
  | 'refunded';

export interface TenantBillingPaymentAttemptRow {
  id: string;
  billing_id: string;
  tenant_id: string;
  gateway: string;
  payment_method: TbAttemptPaymentMethod;
  status: TbAttemptStatus;
  gateway_status: string | null;
  gateway_reference_id: string | null;
  gateway_metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
  is_active: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

const ATTEMPT_SELECT = `id, billing_id, tenant_id, gateway, payment_method, status, gateway_status,
  gateway_reference_id, gateway_metadata, idempotency_key, is_active, activated_at, deactivated_at,
  expires_at, paid_at, created_at, updated_at`;

let hasTablePromise: Promise<boolean> | null = null;

export async function hasTenantBillingPaymentAttemptsTable(): Promise<boolean> {
  if (!hasTablePromise) {
    hasTablePromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'tenant_billing_payment_attempts'`
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasTablePromise;
}

export async function findTenantBillingPaymentAttemptByGatewayReference(
  gateway: string,
  referenceId: string
): Promise<TenantBillingPaymentAttemptRow | null> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return null;
  const r = await pool.query<TenantBillingPaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM tenant_billing_payment_attempts
     WHERE gateway = $1 AND gateway_reference_id = $2
     LIMIT 1`,
    [gateway, referenceId]
  );
  return r.rows[0] ?? null;
}

export async function getTenantBillingPaymentAttemptByIdempotency(
  billingId: string,
  paymentMethod: TbAttemptPaymentMethod,
  idempotencyKey: string
): Promise<TenantBillingPaymentAttemptRow | null> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return null;
  const r = await pool.query<TenantBillingPaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM tenant_billing_payment_attempts
     WHERE billing_id = $1 AND payment_method = $2 AND idempotency_key = $3
     LIMIT 1`,
    [billingId, paymentMethod, idempotencyKey]
  );
  return r.rows[0] ?? null;
}

export async function getActiveTenantBillingPaymentAttempt(
  billingId: string
): Promise<TenantBillingPaymentAttemptRow | null> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return null;
  const r = await pool.query<TenantBillingPaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM tenant_billing_payment_attempts
     WHERE billing_id = $1 AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [billingId]
  );
  return r.rows[0] ?? null;
}

/** Tentativas ainda “abertas” no gateway — usado no polling do checkout SaaS (todas as refs, não só a ativa na UI). */
const TB_ATTEMPT_OPEN_STATUSES: TbAttemptStatus[] = [
  'pending',
  'waiting_payment',
  'processing',
  'overdue',
];

export async function listTenantBillingAttemptsOpenForGatewaySync(
  billingId: string
): Promise<TenantBillingPaymentAttemptRow[]> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return [];
  const r = await pool.query<TenantBillingPaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM tenant_billing_payment_attempts
     WHERE billing_id = $1
       AND status = ANY($2::text[])
       AND gateway_reference_id IS NOT NULL
     ORDER BY updated_at DESC NULLS LAST, created_at DESC`,
    [billingId, TB_ATTEMPT_OPEN_STATUSES]
  );
  return r.rows;
}

/** Outras tentativas pendentes da mesma cobrança (mesma ideia de `listPendingAttemptsForInvoiceExcept`). */
export async function listPendingTenantBillingAttemptsExcept(
  billingId: string,
  exceptAttemptId: string
): Promise<TenantBillingPaymentAttemptRow[]> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return [];
  const r = await pool.query<TenantBillingPaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM tenant_billing_payment_attempts
     WHERE billing_id = $1
       AND id <> $2
       AND status = ANY($3::text[])
       AND gateway_reference_id IS NOT NULL`,
    [billingId, exceptAttemptId, TB_ATTEMPT_OPEN_STATUSES]
  );
  return r.rows;
}

export async function findReusableTenantBillingPaymentAttempt(
  billingId: string,
  paymentMethod: TbAttemptPaymentMethod
): Promise<TenantBillingPaymentAttemptRow | null> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return null;
  const r = await pool.query<TenantBillingPaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM tenant_billing_payment_attempts
     WHERE billing_id = $1
       AND payment_method = $2
       AND status IN ('pending', 'waiting_payment', 'processing', 'overdue')
       AND gateway_reference_id IS NOT NULL
     ORDER BY is_active DESC, created_at DESC
     LIMIT 1`,
    [billingId, paymentMethod]
  );
  return r.rows[0] ?? null;
}

export interface CreateTbAttemptInput {
  billing_id: string;
  tenant_id: string;
  gateway: string;
  payment_method: TbAttemptPaymentMethod;
  status?: TbAttemptStatus;
  gateway_status?: string | null;
  gateway_reference_id?: string | null;
  gateway_metadata?: Record<string, unknown> | null;
  idempotency_key?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
  paid_at?: string | null;
}

export async function createTenantBillingPaymentAttempt(
  input: CreateTbAttemptInput
): Promise<TenantBillingPaymentAttemptRow | null> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return null;

  const status = input.status ?? 'pending';
  const isActive = input.is_active === true;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    /**
     * Sem app.current_tenant_id / bypass, o PostgreSQL aplica RLS em tenant_billing na verificação da FK
     * billing_id → tenant_billing(id) e a linha “some” — 23503 mesmo com fatura existente (ex.: POST /plan-purchase).
     */
    await client.query("SET LOCAL app.bypass_rls = '1'");

    if (isActive) {
      await client.query(
        `UPDATE tenant_billing_payment_attempts
         SET is_active = false, deactivated_at = COALESCE(deactivated_at, now()), updated_at = now()
         WHERE billing_id = $1 AND is_active = true`,
        [input.billing_id]
      );
    }

    const inserted = await client.query<TenantBillingPaymentAttemptRow>(
      `INSERT INTO tenant_billing_payment_attempts (
        billing_id, tenant_id, gateway, payment_method, status, gateway_status, gateway_reference_id,
        gateway_metadata, idempotency_key, is_active, activated_at, expires_at, paid_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::timestamptz, $13::timestamptz
      )
      RETURNING ${ATTEMPT_SELECT}`,
      [
        input.billing_id,
        input.tenant_id,
        input.gateway,
        input.payment_method,
        status,
        input.gateway_status ?? null,
        input.gateway_reference_id ?? null,
        JSON.stringify(input.gateway_metadata ?? {}),
        input.idempotency_key ?? null,
        isActive,
        isActive ? new Date().toISOString() : null,
        input.expires_at ?? null,
        input.paid_at ?? null,
      ]
    );

    await client.query('COMMIT');
    return inserted.rows[0] ?? null;
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '23505' && input.idempotency_key) {
      const existing = await getTenantBillingPaymentAttemptByIdempotency(
        input.billing_id,
        input.payment_method,
        input.idempotency_key
      );
      if (existing) {
        await client.query('ROLLBACK').catch(() => {});
        return existing;
      }
    }
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function markTenantBillingAttemptCancelledSuperseded(
  attemptId: string,
  patch: { reason: string; superseded_by?: 'switch' | 'paid_other' }
): Promise<void> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return;
  const meta = {
    superseded: true,
    superseded_at: new Date().toISOString(),
    superseded_reason: patch.reason,
    ...(patch.superseded_by ? { superseded_by: patch.superseded_by } : {}),
  };
  await pool.query(
    `UPDATE tenant_billing_payment_attempts
     SET status = 'cancelled',
         is_active = false,
         deactivated_at = COALESCE(deactivated_at, now()),
         idempotency_key = NULL,
         gateway_metadata = COALESCE(gateway_metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = now()
     WHERE id = $1`,
    [attemptId, JSON.stringify(meta)]
  );
}

export async function activateTenantBillingPaymentAttempt(
  billingId: string,
  attemptId: string
): Promise<void> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.bypass_rls = '1'");
    await client.query(
      `UPDATE tenant_billing_payment_attempts
       SET is_active = false, deactivated_at = COALESCE(deactivated_at, now()), updated_at = now()
       WHERE billing_id = $1 AND is_active = true AND id <> $2`,
      [billingId, attemptId]
    );
    await client.query(
      `UPDATE tenant_billing_payment_attempts
       SET is_active = true, activated_at = COALESCE(activated_at, now()), deactivated_at = NULL, updated_at = now()
       WHERE id = $1 AND billing_id = $2`,
      [attemptId, billingId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateTenantBillingPaymentAttemptStatus(params: {
  attemptId: string;
  status: TbAttemptStatus;
  gatewayStatus?: string | null;
  paidAt?: Date | null;
}): Promise<void> {
  if (!(await hasTenantBillingPaymentAttemptsTable())) return;
  const isPaid = params.status === 'paid';
  await pool.query(
    `UPDATE tenant_billing_payment_attempts
     SET status = $1,
         gateway_status = COALESCE($2, gateway_status),
         paid_at = CASE
           WHEN $1 = 'paid' THEN COALESCE($3::timestamptz, paid_at, now())
           ELSE paid_at
         END,
         updated_at = now()
     WHERE id = $4`,
    [params.status, params.gatewayStatus ?? null, params.paidAt ?? null, params.attemptId]
  );
}
