/**
 * CRUD de tenant_billing: criação, lookup por gateway e atualização de status.
 * Geração de invoice_number; usado pelo webhook e pelo fluxo de compra.
 * Fase 4: apenas colunas genéricas gateway_reference_id, gateway_metadata, gateway_status.
 */
import { pool } from '../utils/db.js';
import { billingLog } from './billingLogger.js';
import type { GatewayPaymentData } from '../modules/payments/paymentGatewayTypes.js';

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
  gateway_reference_id: string | null;
  gateway_metadata: Record<string, unknown> | null;
  gateway_status: string | null;
  idempotency_key: string | null;
  period_start: string | null;
  period_end: string | null;
  subscription_id: string | null;
  plan_name_snapshot: string | null;
  plan_price_snapshot: number | null;
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
  idempotency_key?: string | null;
  subscription_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  plan_name_snapshot?: string | null;
  plan_price_snapshot?: number | null;
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
 * Cria registro em tenant_billing. Inclui subscription_id, period_start/end e snapshot do plano quando recorrência.
 */
export async function createInvoice(data: CreateInvoiceInput): Promise<TenantBillingRow> {
  const dueDate = typeof data.due_date === 'string' ? data.due_date : data.due_date.toISOString().slice(0, 10);
  const invoiceNumber = generateInvoiceNumber(data.tenant_id);

  const result = await pool.query<TenantBillingRow>(
    `INSERT INTO tenant_billing (
      tenant_id, plan_id, billing_interval, amount_cents, due_date, status, invoice_number,
      gateway, payment_method, idempotency_key,
      users_count, source, billing_reason, subscription_id, period_start, period_end,
      plan_name_snapshot, plan_price_snapshot
    ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, paid_at,
      invoice_number, gateway, payment_method,
      gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
      period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
      users_count, source, billing_reason, created_at, updated_at`,
    [
      data.tenant_id,
      data.plan_id,
      data.billing_interval,
      data.amount_cents,
      dueDate,
      invoiceNumber,
      data.gateway ?? null,
      data.payment_method ?? null,
      data.idempotency_key ?? null,
      data.users_count ?? null,
      data.source ?? null,
      data.billing_reason ?? null,
      data.subscription_id ?? null,
      data.period_start ?? null,
      data.period_end ?? null,
      data.plan_name_snapshot ?? null,
      data.plan_price_snapshot ?? null,
    ]
  );
  const row = result.rows[0];
  billingLog('invoice', 'invoice_created', {
    subscriptionId: data.subscription_id ?? undefined,
    invoiceId: row.id,
    invoiceNumber: row.invoice_number ?? undefined,
    periodStart: data.period_start ?? undefined,
    periodEnd: data.period_end ?? undefined,
    amount: data.amount_cents,
  });
  return row;
}

/**
 * Atualiza subscription_id na fatura (após criar assinatura no activatePlanFromBilling).
 */
export async function setBillingSubscriptionId(
  billingId: string,
  subscriptionId: string
): Promise<void> {
  await pool.query(
    `UPDATE tenant_billing SET subscription_id = $1, updated_at = now() WHERE id = $2`,
    [subscriptionId, billingId]
  );
}

/**
 * Busca tenant_billing pelo ID do pagamento no gateway (gateway_reference_id).
 * Fase 3: lookup apenas por coluna genérica.
 */
export async function getInvoiceByGatewayPaymentId(
  gateway: string,
  paymentId: string
): Promise<TenantBillingRow | null> {
  return getInvoiceByGatewayReferenceId(gateway, paymentId);
}

/**
 * Busca tenant_billing por (gateway, gateway_reference_id).
 */
export async function getInvoiceByGatewayReferenceId(
  gateway: string,
  referenceId: string
): Promise<TenantBillingRow | null> {
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing
     WHERE gateway = $1 AND gateway_reference_id = $2`,
    [gateway, referenceId]
  );
  return result.rows[0] ?? null;
}

/**
 * Atualiza dados do gateway na fatura (após createCharge). Fase 4: apenas colunas genéricas.
 */
export async function updateInvoiceGatewayData(
  billingId: string,
  data: GatewayPaymentData
): Promise<void> {
  const metadataJson = data.gateway_metadata != null ? JSON.stringify(data.gateway_metadata) : null;
  await pool.query(
    `UPDATE tenant_billing
     SET gateway = $1, payment_method = $2,
         gateway_reference_id = $3, gateway_metadata = $4, gateway_status = $5,
         idempotency_key = COALESCE($6, idempotency_key), updated_at = now()
     WHERE id = $7`,
    [
      data.gateway,
      data.payment_method,
      data.gateway_reference_id,
      metadataJson,
      data.gateway_status,
      data.idempotency_key ?? null,
      billingId,
    ]
  );
}

/**
 * Atualiza status da fatura (e paid_at, payment_method, gateway_status quando pago). Fase 4: apenas gateway_status.
 */
export async function updateInvoiceStatus(
  billingId: string,
  status: BillingStatus,
  paidAt?: Date | null,
  paymentMethod?: string | null,
  gatewayStatus?: string | null
): Promise<void> {
  if (status === 'paid') {
    await pool.query(
      `UPDATE tenant_billing
       SET status = $1, paid_at = COALESCE($2::timestamptz, now()), payment_method = COALESCE($3, payment_method),
           gateway_status = COALESCE($4, gateway_status), updated_at = now()
       WHERE id = $5`,
      [status, paidAt ?? null, paymentMethod ?? null, gatewayStatus ?? null, billingId]
    );
  } else {
    await pool.query(
      `UPDATE tenant_billing
       SET status = $1, gateway_status = COALESCE($2, gateway_status), updated_at = now()
       WHERE id = $3`,
      [status, gatewayStatus ?? null, billingId]
    );
  }
}

/**
 * Busca fatura por id (para ativação).
 */
export async function getInvoiceById(billingId: string): Promise<TenantBillingRow | null> {
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing WHERE id = $1`,
    [billingId]
  );
  return result.rows[0] ?? null;
}

/**
 * Verifica se já existe fatura para a assinatura e período (idempotência).
 */
export async function findInvoiceBySubscriptionAndPeriod(
  subscriptionId: string,
  periodStart: string
): Promise<TenantBillingRow | null> {
  const result = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing
     WHERE subscription_id = $1 AND period_start = $2
     LIMIT 1`,
    [subscriptionId, periodStart]
  );
  return result.rows[0] ?? null;
}
