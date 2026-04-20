/**
 * Checkout público da loja (MVP 1 item): pedido + fatura manual com payment_token.
 * Usa withTenantRlsContext para INSERT em orders/order_items/customer_invoices sob RLS.
 */
import { pool, withTenantRlsContext } from '../utils/db.js';
import { createManualCustomerInvoice } from './customerInvoiceService.js';
import type { CreateManualCustomerInvoiceItemInput } from './customerInvoiceService.js';
import {
  findClientByStoreOwnerPhone,
  parseCpfCnpjDigits,
  assertCpfCnpjValidOrThrow,
} from './storeCheckoutClientResolver.js';

export interface StoreCheckoutCreateInput {
  store_slug: string;
  product_id: string;
  quantity: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  /** Opcional: se informado e válido, grava no CRM antes da fatura (cliente novo ou sem documento). */
  customer_cpf_cnpj?: string | null;
  idempotency_key?: string | null;
  /** Se informado, deve coincidir com o total em centavos calculado no servidor (defesa contra UI desatualizada). */
  expected_total_cents?: number | null;
}

export interface StoreCheckoutCreateResult {
  order_id: string;
  order_number: string;
  customer_invoice_id: string;
  payment_token: string;
  amount_cents: number;
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Preço efetivo em BRL (número) para vitrine/checkout; alinhado à lógica do admin (preço com desconto quando menor). */
export function resolvePublicUnitPriceBrl(row: {
  price: string | number | null;
  discount_price: string | number | null;
}): number | null {
  const rawPrice = row.price != null ? Number(row.price) : null;
  const rawDisc = row.discount_price != null ? Number(row.discount_price) : null;
  let value: number | null = rawPrice;
  if (rawDisc != null && rawPrice != null && rawDisc < rawPrice) {
    value = rawDisc;
  } else if (rawDisc != null && rawPrice == null) {
    value = rawDisc;
  }
  if (value == null || Number.isNaN(value) || value <= 0) return null;
  return value;
}

function addDaysIsoDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface StoreCheckoutStoreContext {
  storeUserId: string;
  tenantId: string;
}

export async function resolveStoreCheckoutStoreContext(slugNormalized: string): Promise<StoreCheckoutStoreContext> {
  const storeRes = await pool.query<{
    user_id: string;
    is_active: boolean;
    store_checkout_enabled: boolean;
    tenant_id: string;
  }>(
    `SELECT sp.user_id, sp.is_active, sp.store_checkout_enabled, u.tenant_id::text AS tenant_id
     FROM store_profiles sp
     INNER JOIN users u ON u.id = sp.user_id
     WHERE lower(trim(sp.store_slug)) = $1`,
    [slugNormalized]
  );
  if (storeRes.rows.length === 0) {
    throw Object.assign(new Error('Loja não encontrada'), { statusCode: 404 });
  }
  const storeRow = storeRes.rows[0];
  if (!storeRow.is_active) {
    throw Object.assign(new Error('Loja indisponível'), { statusCode: 403 });
  }
  if (!storeRow.store_checkout_enabled) {
    throw Object.assign(new Error('Checkout online não está habilitado para esta loja'), {
      statusCode: 403,
    });
  }
  if (!storeRow.tenant_id) {
    throw Object.assign(new Error('Loja sem tenant'), { statusCode: 400 });
  }
  return { storeUserId: storeRow.user_id, tenantId: storeRow.tenant_id };
}

/** CPF/CNPJ opcional no checkout: vazio = null; preenchido com formato inválido = 400. */
function parseOptionalCheckoutCpfOrThrow(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const digits = parseCpfCnpjDigits(trimmed);
  if (!digits) {
    throw Object.assign(new Error('CPF ou CNPJ inválido'), {
      statusCode: 400,
      field: 'customer_cpf_cnpj',
      code: 'INVALID_CPF_CNPJ',
    });
  }
  assertCpfCnpjValidOrThrow(digits);
  return digits;
}

async function mergeClientContactFromCheckout(clientId: string, email: string, name: string): Promise<void> {
  const emailNorm = email.trim().toLowerCase();
  const nameTrim = name.trim();
  await pool.query(
    `UPDATE clients SET
       email = CASE
         WHEN (email IS NULL OR btrim(COALESCE(email, '')) = '') AND $2::text <> '' THEN $2::text
         ELSE email
       END,
       name = CASE
         WHEN (name IS NULL OR btrim(COALESCE(name, '')) = '') AND $3::text <> '' THEN $3::text
         ELSE name
       END,
       updated_at = now()
     WHERE id = $1`,
    [clientId, emailNorm || null, nameTrim || null]
  );
}

/**
 * Pré-chefagem pública: indica se o comprador precisará de CPF/CNPJ antes da cobrança no gateway
 * (cliente novo ou cadastro sem documento). Quando true, o checkout pode coletar o documento aqui;
 * caso contrário o fluxo espelha a fatura pública (`completePaymentByToken` em `/pay/:token`).
 */
export async function getStoreCheckoutClientEligibility(input: {
  store_slug: string;
  customer_phone: string;
}): Promise<{ needs_cpf: boolean }> {
  const slug = normalizeSlug(input.store_slug);
  const phone = input.customer_phone.trim();
  if (phone.length < 8) {
    throw Object.assign(new Error('Telefone é obrigatório'), { statusCode: 400, field: 'customer_phone' });
  }
  if (phone.length > 40) {
    throw Object.assign(new Error('Telefone inválido'), { statusCode: 400, field: 'customer_phone' });
  }
  const { storeUserId, tenantId } = await resolveStoreCheckoutStoreContext(slug);
  const clientRow = await findClientByStoreOwnerPhone(storeUserId, tenantId, phone);
  const needs_cpf = clientRow == null || !String(clientRow.cpf_cnpj ?? '').trim();
  return { needs_cpf };
}

/** Idempotência: retorna resposta anterior se checkout já concluído para a mesma chave. */
async function findCompletedByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string
): Promise<StoreCheckoutCreateResult | null> {
  return withTenantRlsContext(tenantId, async () => {
    const r = await pool.query<{
      id: string;
      order_number: string;
      customer_invoice_id: string;
      payment_token: string;
      amount_cents: string | number;
    }>(
      `SELECT o.id, o.order_number, o.customer_invoice_id, ci.payment_token, ci.amount_cents
       FROM orders o
       INNER JOIN customer_invoices ci ON ci.id = o.customer_invoice_id
       WHERE o.store_checkout_idempotency_key = $1
         AND o.customer_invoice_id IS NOT NULL
         AND ci.payment_token IS NOT NULL
       LIMIT 1`,
      [idempotencyKey]
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    return {
      order_id: row.id,
      order_number: row.order_number,
      customer_invoice_id: row.customer_invoice_id,
      payment_token: row.payment_token!,
      amount_cents: Number(row.amount_cents),
    };
  });
}

export async function createStorePublicCheckout(
  input: StoreCheckoutCreateInput
): Promise<StoreCheckoutCreateResult> {
  const slug = normalizeSlug(input.store_slug);
  const qty = input.quantity;
  if (qty !== 1) {
    throw Object.assign(new Error('Nesta versão só é permitida quantidade 1'), { statusCode: 400 });
  }

  const idemp = input.idempotency_key?.trim() || null;
  if (idemp && idemp.length > 200) {
    throw Object.assign(new Error('Idempotency-Key inválida'), { statusCode: 400 });
  }

  const { storeUserId, tenantId } = await resolveStoreCheckoutStoreContext(slug);

  if (idemp) {
    const cached = await findCompletedByIdempotencyKey(tenantId, idemp);
    if (cached) return cached;
  }

  const productRes = await pool.query<{
    id: string;
    name: string;
    type: string;
    price: string | null;
    discount_price: string | null;
  }>(
    `SELECT p.id, p.name, p.type, p.price, p.discount_price
     FROM products p
     INNER JOIN store_profiles sp ON sp.user_id = p.user_id AND lower(trim(sp.store_slug)) = $1
     WHERE p.id = $2
       AND p.status = 'active'
       AND p.is_public = true`,
    [slug, input.product_id]
  );
  if (productRes.rows.length === 0) {
    throw Object.assign(new Error('Produto não encontrado ou indisponível para venda'), { statusCode: 404 });
  }
  const product = productRes.rows[0];
  const unitPriceBrl = resolvePublicUnitPriceBrl(product);
  if (unitPriceBrl == null) {
    throw Object.assign(new Error('Produto sem preço válido para checkout'), { statusCode: 400 });
  }
  const unitPriceCents = Math.round(unitPriceBrl * 100);
  if (unitPriceCents < 1) {
    throw Object.assign(new Error('Valor do produto inválido'), { statusCode: 400 });
  }
  const totalAmount = unitPriceBrl * qty;
  const serverTotalCents = unitPriceCents * qty;
  if (input.expected_total_cents != null && input.expected_total_cents !== serverTotalCents) {
    throw Object.assign(new Error('Valor enviado não confere com o preço atual do produto'), {
      statusCode: 400,
    });
  }

  const checkoutPhone = (input.customer_phone ?? '').trim();
  if (checkoutPhone.length < 8) {
    throw Object.assign(new Error('Telefone é obrigatório'), { statusCode: 400, field: 'customer_phone' });
  }

  return withTenantRlsContext(tenantId, async () => {
    await pool.query('BEGIN');
    try {
      if (idemp) {
        await pool.query(`SELECT pg_advisory_xact_lock((hashtext($1::text))::bigint)`, [
          `store_checkout:${idemp}`,
        ]);
        const again = await pool.query<{
          id: string;
          order_number: string;
          customer_invoice_id: string;
          payment_token: string;
          amount_cents: string | number;
        }>(
          `SELECT o.id, o.order_number, o.customer_invoice_id, ci.payment_token, ci.amount_cents
           FROM orders o
           INNER JOIN customer_invoices ci ON ci.id = o.customer_invoice_id
           WHERE o.store_checkout_idempotency_key = $1
             AND o.customer_invoice_id IS NOT NULL
           LIMIT 1`,
          [idemp]
        );
        if (again.rows.length > 0) {
          const row = again.rows[0];
          await pool.query('COMMIT');
          return {
            order_id: row.id,
            order_number: row.order_number,
            customer_invoice_id: row.customer_invoice_id,
            payment_token: row.payment_token!,
            amount_cents: Number(row.amount_cents),
          };
        }
      }

      const cpfDigits = parseOptionalCheckoutCpfOrThrow(input.customer_cpf_cnpj ?? undefined);

      const foundClient = await findClientByStoreOwnerPhone(storeUserId, tenantId, checkoutPhone);
      let clientId: string;

      if (foundClient) {
        clientId = foundClient.id;
        await mergeClientContactFromCheckout(clientId, input.customer_email, input.customer_name);
        if (cpfDigits && !String(foundClient.cpf_cnpj ?? '').trim()) {
          await pool.query(`UPDATE clients SET cpf_cnpj = $1, updated_at = now() WHERE id = $2`, [
            cpfDigits,
            clientId,
          ]);
        }
      } else {
        const emailVal = input.customer_email.trim().toLowerCase();
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO clients (user_id, name, email, phone, cpf_cnpj, source)
           VALUES ($1::uuid, $2, $3, $4, $5, 'store_public_checkout')
           RETURNING id`,
          [
            storeUserId,
            input.customer_name.trim(),
            emailVal || null,
            checkoutPhone,
            cpfDigits,
          ]
        );
        const row = ins.rows[0];
        if (!row) throw new Error('Falha ao criar cliente');
        clientId = row.id;
      }

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const orderInsert = await pool.query(
        `INSERT INTO orders (
          order_number, store_user_id, customer_user_id, client_id,
          customer_name, customer_email, customer_phone,
          total_amount, payment_method, notes, status, payment_status
        ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, NULL, NULL, 'pending', 'pending')
        RETURNING id`,
        [
          orderNumber,
          storeUserId,
          clientId,
          input.customer_name.trim(),
          input.customer_email.trim().toLowerCase(),
          checkoutPhone,
          totalAmount,
        ]
      );
      const orderId = orderInsert.rows[0].id as string;

      await pool.query(
        `INSERT INTO order_items (
          order_id, product_id, product_name, product_type,
          quantity, unit_price, total_price, selected_variation
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
        [
          orderId,
          product.id,
          product.name,
          product.type,
          qty,
          unitPriceBrl,
          unitPriceBrl * qty,
        ]
      );

      const invoiceItems: CreateManualCustomerInvoiceItemInput[] = [
        {
          description: product.name,
          quantity: qty,
          unit_price_cents: unitPriceCents,
          discount_cents: 0,
          product_id: product.id,
          is_recurring: false,
          recurring_interval: null,
          scheduled_due_date: null,
        },
      ];

      const invoice = await createManualCustomerInvoice({
        tenant_id: tenantId,
        client_id: clientId,
        amount_cents: serverTotalCents,
        due_date: addDaysIsoDate(7),
        description: `Pedido ${orderNumber} — ${product.name}`.slice(0, 500),
        items: invoiceItems,
        gateway_metadata: {
          source: 'store_public_checkout',
          order_id: orderId,
          order_number: orderNumber,
        },
      });

      if (!invoice.payment_token) {
        throw new Error('Fatura sem payment_token');
      }

      await pool.query(
        `UPDATE orders
         SET customer_invoice_id = $1,
             store_checkout_idempotency_key = COALESCE($2, store_checkout_idempotency_key),
             updated_at = now()
         WHERE id = $3`,
        [invoice.id, idemp, orderId]
      );

      const invLink = await pool.query<{ customer_invoice_id: string | null }>(
        `SELECT customer_invoice_id FROM orders WHERE id = $1 LIMIT 1`,
        [orderId]
      );
      if (!invLink.rows[0]?.customer_invoice_id) {
        throw new Error('Invariante: checkout da loja exige pedido vinculado à fatura (customer_invoice_id)');
      }

      await pool.query('COMMIT');

      return {
        order_id: orderId,
        order_number: orderNumber,
        customer_invoice_id: invoice.id,
        payment_token: invoice.payment_token,
        amount_cents: serverTotalCents,
      };
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  });
}
