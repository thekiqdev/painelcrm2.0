/**
 * CRUD de tenant_billing: criação, lookup por gateway e atualização de status.
 * Geração de invoice_number; usado pelo webhook e pelo fluxo de compra.
 */
import { pool } from '../utils/db.js';

export type BillingInterval = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';
export type BillingSource = 'superadmin' | 'self_service' | 'api';
export type BillingReason = 'plan_purchase' | 'plan_upgrade' | 'plan_renewal' | 'manual_charge';
export type BillingStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface TenantBillingRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  billing_interval: string;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  invoice_number: string | null;
  gateway: string | null;
  payment_method: string | null;
  asaas_payment_id: string | null;
  asaas_status: string | null;
  idempotency_key: string | null;
  period_start: string | null;
  period_end: string | null;
  users_count: number | null;
  source: string | null;
  billing_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateInvoiceInput {
  tenant_id: string;
  plan_id: string;
  billing_interval: BillingInterval;
  amount_cents: number;
  due_date: Date | string;
  source?: BillingSource | null;
  billing_reason?: BillingReason | null;
  payment_method?: string | null;
  users_count?: number | null;
  gateway?: string | null;
  asaas_payment_id?: string | null;
  asaas_status?: string | null;
  idempotency_key?: string | null;
}

/**
 * Gera invoice_number: INV-{primeiros 8 do tenant_id}-{timestamp base36}
 */
function generateInvoiceNumber(tenantId: string): string {
  const short = tenantId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const suffix = Date.now().toString(36).toUpperCase();
  return `INV-${short}-${suffix}`;
}

/**
 * Cria registro em tenant_billing. Campos novos (Fase 1): users_count, source, billing_reason.
 */
export async function createInvoice(data: CreateInvoiceInput): Promise<TenantBillingRow> {
  const dueDate = typeof data.due_date === 'string' ? data.due_date : data.due_date.toISOString().slice(0, 10);
  const invoiceNumber = generateInvoiceNumber(data.tenant_id);

  const result = await pool.query<TenantBillingRow>(
    `INSERT INTO tenant_billing (
      tenant_id, plan_id, billing_interval, amount_cents, due_date, status, invoice_number,
      gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key,
      users_count, source, billing_reason
    ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, paid_at,
      invoice_number, gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key,
      period_start, period_end, users_count, source, billing_reason, created_at, updated_at`,
    [
      data.tenant_id,
      data.plan_id,
      data.billing_interval,
      data.amount_cents,
      dueDate,
      invoiceNumber,
      data.gateway ?? null,
      data.payment_method ?? null,
      data.asaas_payment_id ?? null,
      data.asaas_status ?? null,
      data.idempotency_key ?? null,
      data.users_count ?? null,
      data.source ?? null,
      data.billing_reason ?? null,
    ]
  );
  return result.rows[0];
}

/**
 * Busca tenant_billing pelo ID do pagamento no gateway (ex.: asaas_payment_id).
 * Para gateway 'asaas' usa coluna asaas_payment_id.
 */
export async function getInvoiceByGatewayPaymentId(
  gateway: string,
  paymentId: string
): Promise<TenantBillingRow | null> {
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, paid_at,
       invoice_number, gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key,
       period_start, period_end, users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing
     WHERE gateway = $1 AND asaas_payment_id = $2`,
    [gateway, paymentId]
  );
  return result.rows[0] ?? null;
}

/**
 * Atualiza dados do gateway na fatura (após createCharge).
 */
export async function updateInvoiceGatewayData(
  billingId: string,
  data: {
    gateway: string;
    payment_method: string | null;
    asaas_payment_id: string | null;
    asaas_status: string | null;
    idempotency_key?: string | null;
  }
): Promise<void> {
  await pool.query(
    `UPDATE tenant_billing
     SET gateway = $1, payment_method = $2, asaas_payment_id = $3, asaas_status = $4, idempotency_key = COALESCE($5, idempotency_key), updated_at = now()
     WHERE id = $6`,
    [data.gateway, data.payment_method, data.asaas_payment_id, data.asaas_status, data.idempotency_key ?? null, billingId]
  );
}

/**
 * Atualiza status da fatura (e paid_at, payment_method quando pago).
 */
export async function updateInvoiceStatus(
  billingId: string,
  status: BillingStatus,
  paidAt?: Date | null,
  paymentMethod?: string | null
): Promise<void> {
  if (status === 'paid') {
    await pool.query(
      `UPDATE tenant_billing
       SET status = $1, paid_at = COALESCE($2::timestamptz, now()), payment_method = COALESCE($3, payment_method), updated_at = now()
       WHERE id = $4`,
      [status, paidAt ?? null, paymentMethod ?? null, billingId]
    );
  } else {
    await pool.query(
      `UPDATE tenant_billing SET status = $1, updated_at = now() WHERE id = $2`,
      [status, billingId]
    );
  }
}

/**
 * Busca fatura por id (para ativação).
 */
export async function getInvoiceById(billingId: string): Promise<TenantBillingRow | null> {
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, paid_at,
       invoice_number, gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key,
       period_start, period_end, users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing WHERE id = $1`,
    [billingId]
  );
  return result.rows[0] ?? null;
}
