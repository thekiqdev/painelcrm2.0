/**
 * Fase 1 (Design Checkpoint): serviço base para tentativas de pagamento por fatura.
 * Mantém compatibilidade quando a tabela ainda não existir (no-op controlado).
 */
import { pool } from '../utils/db.js';

export type InvoiceAttemptPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';
export type InvoiceAttemptStatus =
  | 'pending'
  | 'waiting_payment'
  | 'processing'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'failed'
  | 'refunded';

export interface CustomerInvoicePaymentAttemptRow {
  id: string;
  invoice_id: string;
  tenant_id: string;
  gateway: string;
  payment_method: InvoiceAttemptPaymentMethod;
  status: InvoiceAttemptStatus;
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

const ATTEMPT_SELECT = `id, invoice_id, tenant_id, gateway, payment_method, status, gateway_status,
  gateway_reference_id, gateway_metadata, idempotency_key, is_active, activated_at, deactivated_at,
  expires_at, paid_at, created_at, updated_at`;

let hasTablePromise: Promise<boolean> | null = null;

/** Indica se a tabela de tentativas existe (migração 82+ aplicada). */
export async function hasInvoicePaymentAttemptsTable(): Promise<boolean> {
  if (!hasTablePromise) {
    hasTablePromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'customer_invoice_payment_attempts'`
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return hasTablePromise;
}

export interface CreateInvoiceAttemptInput {
  invoice_id: string;
  tenant_id: string;
  gateway: string;
  payment_method: InvoiceAttemptPaymentMethod;
  status?: InvoiceAttemptStatus;
  gateway_status?: string | null;
  gateway_reference_id?: string | null;
  gateway_metadata?: Record<string, unknown> | null;
  idempotency_key?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
  paid_at?: string | null;
}

/**
 * Cria tentativa; se is_active=true, desativa a ativa anterior da invoice.
 * Em ambiente sem migration da fase 1 aplicada, retorna null sem quebrar fluxo.
 */
export async function createInvoicePaymentAttempt(
  input: CreateInvoiceAttemptInput
): Promise<CustomerInvoicePaymentAttemptRow | null> {
  if (!(await hasInvoicePaymentAttemptsTable())) return null;

  const status = input.status ?? 'pending';
  const isActive = input.is_active === true;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (isActive) {
      await client.query(
        `UPDATE customer_invoice_payment_attempts
         SET is_active = false, deactivated_at = COALESCE(deactivated_at, now()), updated_at = now()
         WHERE invoice_id = $1 AND is_active = true`,
        [input.invoice_id]
      );
    }

    const inserted = await client.query<CustomerInvoicePaymentAttemptRow>(
      `INSERT INTO customer_invoice_payment_attempts (
        invoice_id, tenant_id, gateway, payment_method, status, gateway_status, gateway_reference_id,
        gateway_metadata, idempotency_key, is_active, activated_at, expires_at, paid_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::timestamptz, $13::timestamptz
      )
      RETURNING ${ATTEMPT_SELECT}`,
      [
        input.invoice_id,
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
      const existing = await getInvoicePaymentAttemptByIdempotency(
        input.invoice_id,
        input.payment_method,
        input.idempotency_key
      );
      if (existing) return existing;
    }
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getActiveInvoicePaymentAttempt(
  invoiceId: string
): Promise<CustomerInvoicePaymentAttemptRow | null> {
  if (!(await hasInvoicePaymentAttemptsTable())) return null;
  const r = await pool.query<CustomerInvoicePaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1 AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [invoiceId]
  );
  return r.rows[0] ?? null;
}

export async function findInvoiceAttemptByGatewayReference(
  gateway: string,
  referenceId: string
): Promise<CustomerInvoicePaymentAttemptRow | null> {
  if (!(await hasInvoicePaymentAttemptsTable())) return null;
  const r = await pool.query<CustomerInvoicePaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM customer_invoice_payment_attempts
     WHERE gateway = $1 AND gateway_reference_id = $2
     LIMIT 1`,
    [gateway, referenceId]
  );
  return r.rows[0] ?? null;
}

export async function getInvoicePaymentAttemptByIdempotency(
  invoiceId: string,
  paymentMethod: InvoiceAttemptPaymentMethod,
  idempotencyKey: string
): Promise<CustomerInvoicePaymentAttemptRow | null> {
  if (!(await hasInvoicePaymentAttemptsTable())) return null;
  const r = await pool.query<CustomerInvoicePaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1 AND payment_method = $2 AND idempotency_key = $3
     LIMIT 1`,
    [invoiceId, paymentMethod, idempotencyKey]
  );
  return r.rows[0] ?? null;
}

export async function findReusableInvoicePaymentAttempt(
  invoiceId: string,
  paymentMethod: InvoiceAttemptPaymentMethod
): Promise<CustomerInvoicePaymentAttemptRow | null> {
  if (!(await hasInvoicePaymentAttemptsTable())) return null;
  const r = await pool.query<CustomerInvoicePaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1
       AND payment_method = $2
       AND status IN ('pending', 'waiting_payment', 'processing', 'overdue')
       AND gateway_reference_id IS NOT NULL
     ORDER BY is_active DESC, created_at DESC
     LIMIT 1`,
    [invoiceId, paymentMethod]
  );
  return r.rows[0] ?? null;
}

/**
 * Outras tentativas da mesma fatura com `gateway_reference_id` (exceto a vencedora), para cleanup
 * pós-pagamento (`applyPaymentEvent` / `supersedeOtherPendingAttemptsAfterPaid`).
 *
 * Regra: todos os status exceto `paid` e `refunded` (inclui pending, cancelled, failed, etc.).
 * Troca de método pode marcar linhas como `cancelled` localmente enquanto a cobrança segue no
 * gateway — `deleteGatewayChargeIfSafe` decide apagar ou ignorar conforme estado real no Asaas.
 */
export async function listPendingAttemptsForInvoiceExcept(
  invoiceId: string,
  excludeAttemptId: string
): Promise<CustomerInvoicePaymentAttemptRow[]> {
  if (!(await hasInvoicePaymentAttemptsTable())) return [];
  const r = await pool.query<CustomerInvoicePaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1
       AND id <> $2
       AND status NOT IN ('paid', 'refunded')
       AND gateway_reference_id IS NOT NULL
     ORDER BY created_at ASC`,
    [invoiceId, excludeAttemptId]
  );
  return r.rows;
}

/**
 * Mesmo critério de cleanup que `listPendingAttemptsForInvoiceExcept`, mas exclui pelo
 * `gateway_reference_id` do pagamento vencedor (quando não há linha da tentativa paga ou não se
 * conhece o `id` da tentativa).
 */
export async function listAttemptsForCleanupExceptGatewayReference(
  invoiceId: string,
  excludeGatewayReferenceId: string
): Promise<CustomerInvoicePaymentAttemptRow[]> {
  if (!(await hasInvoicePaymentAttemptsTable())) return [];
  const r = await pool.query<CustomerInvoicePaymentAttemptRow>(
    `SELECT ${ATTEMPT_SELECT}
     FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1
       AND gateway_reference_id IS NOT NULL
       AND gateway_reference_id <> $2
       AND status NOT IN ('paid', 'refunded')
     ORDER BY created_at ASC`,
    [invoiceId, excludeGatewayReferenceId]
  );
  return r.rows;
}

/** Marca tentativa como cancelada/supersedida sem apagar linha (histórico). */
export async function markAttemptCancelledSuperseded(
  attemptId: string,
  patch: { reason: string; superseded_by?: 'paid_other' | 'switch' }
): Promise<void> {
  if (!(await hasInvoicePaymentAttemptsTable())) return;
  const meta = {
    superseded: true,
    superseded_at: new Date().toISOString(),
    superseded_reason: patch.reason,
    ...(patch.superseded_by ? { superseded_by: patch.superseded_by } : {}),
  };
  await pool.query(
    `UPDATE customer_invoice_payment_attempts
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

export async function activateInvoicePaymentAttempt(
  invoiceId: string,
  attemptId: string
): Promise<void> {
  if (!(await hasInvoicePaymentAttemptsTable())) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE customer_invoice_payment_attempts
       SET is_active = false, deactivated_at = COALESCE(deactivated_at, now()), updated_at = now()
       WHERE invoice_id = $1 AND is_active = true AND id <> $2`,
      [invoiceId, attemptId]
    );
    await client.query(
      `UPDATE customer_invoice_payment_attempts
       SET is_active = true, activated_at = COALESCE(activated_at, now()), deactivated_at = NULL, updated_at = now()
       WHERE id = $1 AND invoice_id = $2`,
      [attemptId, invoiceId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listInvoicePaymentAttemptsSummary(invoiceId: string): Promise<Array<{
  id: string;
  payment_method: InvoiceAttemptPaymentMethod;
  status: InvoiceAttemptStatus;
  is_active: boolean;
  created_at: string;
}>> {
  if (!(await hasInvoicePaymentAttemptsTable())) return [];
  const r = await pool.query<{
    id: string;
    payment_method: InvoiceAttemptPaymentMethod;
    status: InvoiceAttemptStatus;
    is_active: boolean;
    created_at: string;
  }>(
    `SELECT id, payment_method, status, is_active, created_at
     FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1
     ORDER BY created_at DESC
     LIMIT 25`,
    [invoiceId]
  );
  return r.rows;
}

export async function updateInvoicePaymentAttemptStatus(params: {
  attemptId: string;
  status: InvoiceAttemptStatus;
  gatewayStatus?: string | null;
  paidAt?: Date | null;
}): Promise<void> {
  if (!(await hasInvoicePaymentAttemptsTable())) return;
  const isPaid = params.status === 'paid';
  await pool.query(
    `UPDATE customer_invoice_payment_attempts
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
