/**
 * Faturas recorrentes dos clientes do CRM (Billing Engine Fase 4).
 * Tabela customer_invoices; usado pelo worker quando subscription.type = 'customer'.
 */
import { pool } from '../utils/db.js';
import { billingLog } from './billingLogger.js';

export interface CustomerInvoiceRow {
  id: string;
  tenant_id: string;
  client_id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
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
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerInvoiceInput {
  tenant_id: string;
  client_id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  due_date: string;
  gateway?: string | null;
}

function generateInvoiceNumber(tenantId: string): string {
  const short = tenantId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const suffix = Date.now().toString(36).toUpperCase();
  return `CINV-${short}-${suffix}`;
}

export async function createCustomerInvoice(data: CreateCustomerInvoiceInput): Promise<CustomerInvoiceRow> {
  const invoiceNumber = generateInvoiceNumber(data.tenant_id);
  const r = await pool.query<CustomerInvoiceRow>(
    `INSERT INTO customer_invoices (
      tenant_id, client_id, subscription_id, period_start, period_end, amount_cents, due_date,
      status, invoice_number, gateway
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
    RETURNING id, tenant_id, client_id, subscription_id, period_start, period_end, amount_cents, due_date,
      status, paid_at, invoice_number, gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key,
      created_at, updated_at`,
    [
      data.tenant_id,
      data.client_id,
      data.subscription_id,
      data.period_start,
      data.period_end,
      data.amount_cents,
      data.due_date,
      invoiceNumber,
      data.gateway ?? null,
    ]
  );
  const row = r.rows[0];
  billingLog('invoice', 'invoice_created', {
    subscriptionId: data.subscription_id,
    invoiceId: row.id,
    invoiceNumber: row.invoice_number ?? undefined,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    amount: data.amount_cents,
  });
  return row;
}

export async function findCustomerInvoiceBySubscriptionAndPeriod(
  subscriptionId: string,
  periodStart: string
): Promise<CustomerInvoiceRow | null> {
  const r = await pool.query<CustomerInvoiceRow>(
    `SELECT id, tenant_id, client_id, subscription_id, period_start, period_end, amount_cents, due_date,
       status, paid_at, invoice_number, gateway, payment_method, asaas_payment_id, asaas_status, idempotency_key,
       created_at, updated_at
     FROM customer_invoices
     WHERE subscription_id = $1 AND period_start = $2
     LIMIT 1`,
    [subscriptionId, periodStart]
  );
  return r.rows[0] ?? null;
}

export async function updateCustomerInvoiceGatewayData(
  invoiceId: string,
  data: {
    gateway: string;
    payment_method: string | null;
    asaas_payment_id: string | null;
    asaas_status: string | null;
    idempotency_key?: string | null;
  }
): Promise<void> {
  await pool.query(
    `UPDATE customer_invoices
     SET gateway = $1, payment_method = $2, asaas_payment_id = $3, asaas_status = $4, idempotency_key = COALESCE($5, idempotency_key), updated_at = now()
     WHERE id = $6`,
    [data.gateway, data.payment_method, data.asaas_payment_id, data.asaas_status, data.idempotency_key ?? null, invoiceId]
  );
}
