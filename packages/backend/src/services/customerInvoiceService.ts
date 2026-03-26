/**
 * Faturas dos clientes do CRM (Billing Engine Fase 4 + Customer Billing manuais).
 * Tabela customer_invoices: worker usa createCustomerInvoice (recorrência); painel usa createManualCustomerInvoice.
 * Fase 4: apenas colunas genéricas gateway_reference_id, gateway_metadata, gateway_status.
 */
import crypto from 'node:crypto';
import { pool } from '../utils/db.js';
import { billingLog } from './billingLogger.js';
import { getCustomerInvoiceSchema } from './customerInvoiceSchema.js';
import type { GatewayPaymentData } from '../modules/payments/paymentGatewayTypes.js';

export interface CustomerInvoiceRow {
  id: string;
  tenant_id: string;
  client_id: string | null;
  subscription_id: string | null;
  /** E2: fatura pai quando invoice_type = child. */
  parent_invoice_id: string | null;
  /** E2: linha na fatura pai que originou esta filha. */
  parent_invoice_item_id: string | null;
  period_start: string | null;
  period_end: string | null;
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
  origin: string;
  invoice_type: string;
  description: string | null;
  payment_token: string | null;
  charge_id: string | null;
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

/** Item de fatura manual (linha). total_cents = quantity * unit_price_cents - discount_cents. */
export interface CreateManualCustomerInvoiceItemInput {
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents?: number;
  product_id?: string | null;
  /** Fase 5 (base): se item participa dos ciclos futuros. */
  is_recurring?: boolean;
  /** Fase 5 (base): intervalo por item (ainda sem job automático). */
  recurring_interval?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'yearly' | null;
  /** Fase 5 (base): data planejada para cobrança futura do item. */
  scheduled_due_date?: string | null;
}

export interface CustomerInvoiceItemRow {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  total_cents: number;
  sort_order: number;
  is_recurring: boolean;
  recurring_interval: string | null;
  scheduled_due_date: string | null;
  created_at: string;
}

/** Input para fatura manual (sem subscription; origin=manual, invoice_type=manual). client_id null = fatura por link (Fase 8). */
export interface CreateManualCustomerInvoiceInput {
  tenant_id: string;
  client_id: string | null;
  amount_cents: number;
  due_date: string;
  description?: string | null;
  payment_method?: string | null;
  gateway_metadata?: Record<string, unknown> | null;
  /** Cobrança à qual vincular a fatura (Fase 10). */
  charge_id?: string | null;
  /** Se informado, amount_cents é ignorado e calculado como soma dos total_cents dos itens. */
  items?: CreateManualCustomerInvoiceItemInput[];
}

/** Usado pelo worker para recorrência (não precisa ser globalmente único entre tenants). */
function generateInvoiceNumber(tenantId: string): string {
  const short = tenantId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const suffix = Date.now().toString(36).toUpperCase();
  return `CINV-${short}-${suffix}`;
}

/** Gera invoice_number globalmente único para faturas manuais (CINV-YYYY-XXXXXXXX). */
function generateUniqueInvoiceNumberForManual(id: string, createdAt: string): string {
  const year = new Date(createdAt + 'Z').getUTCFullYear();
  const shortId = id.replace(/-/g, '').slice(0, 8).toLowerCase();
  return `CINV-${year}-${shortId}`;
}

/**
 * Colunas para SELECT (com migração 81). Preferir `getCustomerInvoiceSchema()` em runtime
 * para compatibilidade quando a migração 81 ainda não foi aplicada.
 */
export const CUSTOMER_INVOICE_SELECT_COLUMNS =
  `id, tenant_id, client_id, subscription_id, parent_invoice_id, parent_invoice_item_id, period_start, period_end, amount_cents, due_date,
   status, paid_at, invoice_number, gateway, payment_method,
   gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
   origin, invoice_type, description, payment_token, charge_id, created_at, updated_at`;

export async function createCustomerInvoice(data: CreateCustomerInvoiceInput): Promise<CustomerInvoiceRow> {
  const schema = await getCustomerInvoiceSchema();
  const invoiceNumber = generateInvoiceNumber(data.tenant_id);
  const paymentToken = crypto.randomUUID();
  const r = await pool.query<CustomerInvoiceRow>(
    `INSERT INTO customer_invoices (
      tenant_id, client_id, subscription_id, period_start, period_end, amount_cents, due_date,
      status, invoice_number, gateway, origin, invoice_type, payment_token
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, 'subscription', 'recurring', $10)
    RETURNING ${schema.insertReturning}`,
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
      paymentToken,
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
  return {
    ...row,
    parent_invoice_id: row.parent_invoice_id ?? null,
    parent_invoice_item_id: row.parent_invoice_item_id ?? null,
  };
}

/** E2: fatura filha (invoice_type=child) ligada à fatura pai e ao item de origem. */
export interface CreateChildCustomerInvoiceInput {
  tenant_id: string;
  client_id: string;
  subscription_id: string;
  parent_invoice_id: string;
  parent_invoice_item_id: string;
  amount_cents: number;
  due_date: string;
  gateway?: string | null;
}

/**
 * Cria fatura filha (cobrança em data diferente do ciclo da subscription).
 * period_start/period_end = due_date (janela de um dia).
 */
export async function createChildCustomerInvoice(data: CreateChildCustomerInvoiceInput): Promise<CustomerInvoiceRow> {
  const schema = await getCustomerInvoiceSchema();
  if (!schema.hasParentInvoiceColumns) {
    throw new Error(
      'Faturas filhas (E2) exigem a migração 81 (parent_invoice_id). Execute: npm run migrate no backend.'
    );
  }
  const invoiceNumber = generateInvoiceNumber(data.tenant_id);
  const paymentToken = crypto.randomUUID();
  const due = data.due_date;
  const r = await pool.query<CustomerInvoiceRow>(
    `INSERT INTO customer_invoices (
      tenant_id, client_id, subscription_id, parent_invoice_id, parent_invoice_item_id,
      period_start, period_end, amount_cents, due_date,
      status, invoice_number, gateway, origin, invoice_type, payment_token
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, 'subscription', 'child', $12)
    RETURNING ${schema.insertReturning}`,
    [
      data.tenant_id,
      data.client_id,
      data.subscription_id,
      data.parent_invoice_id,
      data.parent_invoice_item_id,
      due,
      due,
      data.amount_cents,
      due,
      invoiceNumber,
      data.gateway ?? null,
      paymentToken,
    ]
  );
  const row = r.rows[0];
  if (!row) throw new Error('createChildCustomerInvoice: INSERT retornou vazio');
  billingLog('invoice', 'invoice_child_created', {
    subscriptionId: data.subscription_id,
    invoiceId: row.id,
    parentInvoiceId: data.parent_invoice_id,
    parentItemId: data.parent_invoice_item_id,
    dueDate: due,
    amount: data.amount_cents,
  });
  return row;
}

function computeItemTotalCents(item: CreateManualCustomerInvoiceItemInput): number {
  const discount = item.discount_cents ?? 0;
  return Math.max(0, Math.round(Number(item.quantity) * item.unit_price_cents) - discount);
}

/**
 * Cria fatura manual (origin=manual, invoice_type=manual; subscription_id e period_start/end NULL).
 * Se items for informado, amount_cents é calculado como soma dos total_cents dos itens.
 * Gera invoice_number globalmente único (CINV-YYYY-XXXXXXXX) após o INSERT.
 */
export async function createManualCustomerInvoice(
  data: CreateManualCustomerInvoiceInput
): Promise<CustomerInvoiceRow> {
  let amountCents = data.amount_cents;
  const items = data.items ?? [];

  if (items.length > 0) {
    amountCents = items.reduce((sum, it) => sum + computeItemTotalCents(it), 0);
    if (amountCents <= 0) throw new Error('Total dos itens deve ser maior que zero');
  }

  const paymentToken = crypto.randomUUID();
  const r = await pool.query<{ id: string; created_at: string }>(
    `INSERT INTO customer_invoices (
      tenant_id, client_id, subscription_id, period_start, period_end, amount_cents, due_date,
      status, origin, invoice_type, description, payment_method, gateway_metadata, payment_token, charge_id
    ) VALUES ($1, $2, NULL, NULL, NULL, $3, $4, 'pending', 'manual', 'manual', $5, $6, $7, $8, $9)
    RETURNING id, created_at`,
    [
      data.tenant_id,
      data.client_id ?? null,
      amountCents,
      data.due_date,
      data.description ?? null,
      data.payment_method ?? null,
      data.gateway_metadata ? JSON.stringify(data.gateway_metadata) : null,
      paymentToken,
      data.charge_id ?? null,
    ]
  );
  const inserted = r.rows[0];
  if (!inserted) throw new Error('createManualCustomerInvoice: INSERT retornou vazio');

  const invoiceNumber = generateUniqueInvoiceNumberForManual(inserted.id, inserted.created_at);
  await pool.query(
    `UPDATE customer_invoices SET invoice_number = $1, updated_at = now() WHERE id = $2`,
    [invoiceNumber, inserted.id]
  );

  const schema = await getCustomerInvoiceSchema();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const totalCents = computeItemTotalCents(it);
    if (schema.hasInvoiceItemAdvancedColumns) {
      await pool.query(
        `INSERT INTO customer_invoice_items (
        invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order,
        is_recurring, recurring_interval, scheduled_due_date
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          inserted.id,
          it.product_id ?? null,
          it.description,
          it.quantity,
          it.unit_price_cents,
          it.discount_cents ?? 0,
          totalCents,
          i,
          it.is_recurring ?? true,
          it.recurring_interval ?? null,
          it.scheduled_due_date ?? null,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO customer_invoice_items (
        invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          inserted.id,
          it.product_id ?? null,
          it.description,
          it.quantity,
          it.unit_price_cents,
          it.discount_cents ?? 0,
          totalCents,
          i,
        ]
      );
    }
  }
  const rowResult = await pool.query<CustomerInvoiceRow>(
    `SELECT ${schema.selectListBare} FROM customer_invoices WHERE id = $1`,
    [inserted.id]
  );
  const row = rowResult.rows[0];
  if (!row) throw new Error('createManualCustomerInvoice: SELECT após UPDATE retornou vazio');

  billingLog('invoice', 'invoice_created', {
    invoiceId: row.id,
    invoiceNumber: row.invoice_number ?? undefined,
    amount: amountCents,
    origin: 'manual',
  });
  return row;
}

/**
 * Retorna itens da fatura (customer_invoice_items) ordenados por sort_order.
 */
export async function getCustomerInvoiceItems(invoiceId: string): Promise<CustomerInvoiceItemRow[]> {
  const schema = await getCustomerInvoiceSchema();
  if (schema.hasInvoiceItemAdvancedColumns) {
    const r = await pool.query<CustomerInvoiceItemRow>(
      `SELECT id, invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order,
            is_recurring, recurring_interval, scheduled_due_date, created_at
     FROM customer_invoice_items
     WHERE invoice_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
      [invoiceId]
    );
    return r.rows;
  }
  const r = await pool.query<CustomerInvoiceItemRow>(
    `SELECT id, invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order,
            true AS is_recurring, NULL::text AS recurring_interval, NULL::date AS scheduled_due_date, created_at
     FROM customer_invoice_items
     WHERE invoice_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [invoiceId]
  );
  return r.rows;
}

export async function findCustomerInvoiceBySubscriptionAndPeriod(
  subscriptionId: string,
  periodStart: string
): Promise<CustomerInvoiceRow | null> {
  const schema = await getCustomerInvoiceSchema();
  const parentClause = schema.hasParentInvoiceColumns ? 'AND parent_invoice_id IS NULL' : '';
  const r = await pool.query<CustomerInvoiceRow>(
    `SELECT ${schema.selectListBare}
     FROM customer_invoices
     WHERE subscription_id = $1 AND period_start = $2
      ${parentClause}
     LIMIT 1`,
    [subscriptionId, periodStart]
  );
  return r.rows[0] ?? null;
}

export interface GetByPaymentTokenResult {
  invoice: Pick<CustomerInvoiceRow, 'invoice_number' | 'description' | 'amount_cents' | 'due_date' | 'status' | 'payment_method' | 'gateway_metadata'>;
  items: CustomerInvoiceItemRow[];
  client_name: string | null;
  tenant_branding: {
    name: string | null;
    logo_url: string | null;
    billing_phone: string | null;
    billing_email: string | null;
  };
  invoice_id: string;
  tenant_id: string;
  client_id: string | null;
}

/**
 * Busca fatura por payment_token (link único de pagamento). Rota pública; usa função SECURITY DEFINER para bypass RLS.
 * Retorna invoice (campos necessários), itens, client_name; invoice_id/tenant_id/client_id para uso interno (complete).
 */
export async function getByPaymentToken(token: string): Promise<GetByPaymentTokenResult | null> {
  const r = await pool.query<{
    invoice_id: string;
    tenant_id: string;
    client_id: string | null;
    invoice_number: string | null;
    description: string | null;
    amount_cents: number;
    due_date: string;
    status: string;
    payment_method: string | null;
    gateway_metadata: Record<string, unknown> | null;
    client_name: string | null;
  }>(
    `SELECT invoice_id, tenant_id, client_id, invoice_number, description, amount_cents, due_date, status, payment_method, gateway_metadata, client_name
     FROM get_customer_invoice_by_payment_token($1::uuid)`,
    [token]
  );
  const row = r.rows[0] ?? null;
  if (!row) return null;
  const tenantResult = await pool.query<{
    name: string | null;
    logo_url: string | null;
    billing_phone: string | null;
    billing_email: string | null;
  }>(
    `SELECT name, logo_url, billing_phone, billing_email
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [row.tenant_id]
  );
  const tenant = tenantResult.rows[0] ?? null;
  const items = await getCustomerInvoiceItems(row.invoice_id);
  return {
    invoice: {
      invoice_number: row.invoice_number,
      description: row.description,
      amount_cents: row.amount_cents,
      due_date: row.due_date,
      status: row.status,
      payment_method: row.payment_method,
      gateway_metadata: row.gateway_metadata,
    },
    items,
    client_name: row.client_name,
    tenant_branding: {
      name: tenant?.name ?? null,
      logo_url: tenant?.logo_url ?? null,
      billing_phone: tenant?.billing_phone ?? null,
      billing_email: tenant?.billing_email ?? null,
    },
    invoice_id: row.invoice_id,
    tenant_id: row.tenant_id,
    client_id: row.client_id,
  };
}

/**
 * Busca customer_invoice por (gateway, gateway_reference_id). Fase 3 webhook.
 */
export async function findCustomerInvoiceByGatewayReference(
  gateway: string,
  referenceId: string
): Promise<CustomerInvoiceRow | null> {
  const schema = await getCustomerInvoiceSchema();
  const r = await pool.query<CustomerInvoiceRow>(
    `SELECT ${schema.selectListBare}
     FROM customer_invoices
     WHERE gateway = $1 AND gateway_reference_id = $2
     LIMIT 1`,
    [gateway, referenceId]
  );
  return r.rows[0] ?? null;
}

/**
 * Atualiza client_id da fatura (Fase 8: completar fatura por link após preenchimento do cliente).
 */
export async function updateCustomerInvoiceClientId(invoiceId: string, clientId: string): Promise<void> {
  await pool.query(
    `UPDATE customer_invoices SET client_id = $1, updated_at = now() WHERE id = $2`,
    [clientId, invoiceId]
  );
}

/**
 * Vincula fatura manual à assinatura recorrente (Fase 7: primeira fatura da recorrência).
 */
export async function updateCustomerInvoiceSubscriptionLink(
  invoiceId: string,
  subscriptionId: string,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  await pool.query(
    `UPDATE customer_invoices
     SET subscription_id = $1, period_start = $2, period_end = $3, origin = 'subscription', invoice_type = 'recurring', updated_at = now()
     WHERE id = $4`,
    [subscriptionId, periodStart, periodEnd, invoiceId]
  );
}

/**
 * Atualiza dados do gateway na fatura (após createCharge). Fase 4: apenas colunas genéricas.
 */
export async function updateCustomerInvoiceGatewayData(
  invoiceId: string,
  data: GatewayPaymentData
): Promise<void> {
  let mergedMetadata: Record<string, unknown> | null = null;
  if (data.gateway_metadata != null) {
    const current = await pool.query<{ gateway_metadata: Record<string, unknown> | null }>(
      `SELECT gateway_metadata
       FROM customer_invoices
       WHERE id = $1
       LIMIT 1`,
      [invoiceId]
    );
    const prev = current.rows[0]?.gateway_metadata ?? null;
    mergedMetadata = {
      ...(prev ?? {}),
      ...data.gateway_metadata,
    };
  }
  const metadataJson = mergedMetadata != null ? JSON.stringify(mergedMetadata) : null;
  await pool.query(
    `UPDATE customer_invoices
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
      invoiceId,
    ]
  );
}

/**
 * Atualiza status (e opcionalmente paid_at, gateway_status) da fatura. Usado pelo webhook. Fase 4: apenas gateway_status.
 */
export async function updateCustomerInvoiceStatus(
  invoiceId: string,
  status: string,
  paidAt?: Date | null,
  gatewayStatus?: string | null
): Promise<void> {
  if (status === 'paid') {
    await pool.query(
      `UPDATE customer_invoices
       SET status = $1, paid_at = COALESCE($2::timestamptz, now()),
           gateway_status = COALESCE($3, gateway_status), updated_at = now()
       WHERE id = $4`,
      [status, paidAt ?? null, gatewayStatus ?? null, invoiceId]
    );
  } else {
    await pool.query(
      `UPDATE customer_invoices
       SET status = $1, gateway_status = COALESCE($2, gateway_status), updated_at = now()
       WHERE id = $3`,
      [status, gatewayStatus ?? null, invoiceId]
    );
  }
}
