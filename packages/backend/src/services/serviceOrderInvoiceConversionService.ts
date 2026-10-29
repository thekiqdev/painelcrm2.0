/**
 * OS-S5 — Conversão de Ordem de Serviço assinada → fatura manual (clone de propostas).
 */
import { pool } from '../utils/db.js';
import { createManualInvoice } from './customerBillingService.js';
import type { CustomerInvoiceRow, CreateManualCustomerInvoiceItemInput } from './customerInvoiceService.js';
import { getActiveConfig, type PaymentGatewayConfigRow } from './paymentGatewayConfigService.js';
import { resolveAutomaticInvoicePaymentMethod } from './gatewayPaymentMethodPolicy.js';
import { insertServiceOrderEvent } from './serviceOrdersService.js';
import { createNotification } from './notifications.js';

export type ServiceOrderRowForConversion = {
  id: string;
  tenant_id: string;
  created_by: string;
  client_id: string | null;
  status: string;
  billing_mode: string;
  service_order_number: number;
  observations: string | null;
  total_cents: string | number;
  currency: string;
  converted_invoice_id: string | null;
};

export function buildInvoiceItemsFromServiceOrder(
  items: Array<{
    kind: string;
    name: string;
    description?: string | null;
    quantity: number | string;
    unit_price_cents: number | string;
    discount_cents?: number | string | null;
  }>,
  fallback: { number: number; total_cents: number },
): CreateManualCustomerInvoiceItemInput[] {
  const lines: CreateManualCustomerInvoiceItemInput[] = [];
  for (let i = 0; i < items.length; i++) {
    const row = items[i]!;
    const quantity = Math.max(0, Number(row.quantity) || 0);
    const unit_price_cents = Math.max(0, Math.round(Number(row.unit_price_cents) || 0));
    const discount_cents = Math.max(0, Math.round(Number(row.discount_cents) || 0));
    if (quantity <= 0) continue;
    if (unit_price_cents <= 0 && discount_cents <= 0) continue;
    const kindLabel = row.kind === 'product' ? 'Produto' : 'Serviço';
    const description =
      String(row.description || '').trim() ||
      `${kindLabel}: ${String(row.name || '').trim() || `Item ${i + 1}`}`;
    lines.push({
      description,
      quantity,
      unit_price_cents,
      discount_cents,
    });
  }

  if (lines.length === 0) {
    const amt = Math.max(0, fallback.total_cents);
    if (amt <= 0) {
      throw new Error('Ordem de serviço sem itens válidos e sem valor total para faturar');
    }
    return [
      {
        description: `Ordem de Serviço Nº ${fallback.number}`,
        quantity: 1,
        unit_price_cents: amt,
        discount_cents: 0,
      },
    ];
  }
  return lines;
}

export function buildInvoiceDescriptionFromServiceOrder(
  number: number,
  observations: string | null,
): string {
  const head = `Ordem de Serviço Nº ${number}`;
  const body = (observations ?? '').trim();
  if (!body) return head;
  return `${head}\n${body}`;
}

export async function loadServiceOrderForConversion(
  tenantId: string,
  serviceOrderId: string,
): Promise<ServiceOrderRowForConversion | null> {
  const r = await pool.query<ServiceOrderRowForConversion>(
    `SELECT id, tenant_id, created_by, client_id, status, billing_mode, service_order_number,
            observations, total_cents, currency, converted_invoice_id
     FROM public.service_orders
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [serviceOrderId, tenantId],
  );
  return r.rows[0] ?? null;
}

const CONVERTIBLE = new Set(['signed', 'completed']);

export async function convertSignedServiceOrderToInvoice(params: {
  tenantId: string;
  actorUserId: string;
  serviceOrderId: string;
  dueDate: string;
  paymentMethod?: string | null;
  allowedPaymentMethods?: string[] | null;
  gatewayKey?: string | null;
  /** Quando true, ignora billing_mode=none (não usado no auto). */
  force?: boolean;
}): Promise<{ invoice: CustomerInvoiceRow }> {
  const order = await loadServiceOrderForConversion(params.tenantId, params.serviceOrderId);
  if (!order) {
    throw new Error('Ordem de serviço não encontrada');
  }
  if (!CONVERTIBLE.has(order.status)) {
    throw new Error('Apenas ordens assinadas (ou concluídas) podem ser convertidas em fatura');
  }
  if (order.billing_mode === 'none' && !params.force) {
    throw new Error('Esta ordem está configurada sem faturamento (billing_mode=none)');
  }
  if (!order.client_id) {
    throw new Error('Ordem de serviço sem cliente vinculado');
  }
  if (order.converted_invoice_id) {
    throw new Error('Esta ordem de serviço já possui fatura gerada');
  }

  const dup = await pool.query<{ id: string }>(
    `SELECT id FROM customer_invoices WHERE tenant_id = $1 AND service_order_id = $2 LIMIT 1`,
    [params.tenantId, params.serviceOrderId],
  );
  if (dup.rows.length > 0) {
    throw new Error('Já existe fatura vinculada a esta ordem de serviço');
  }

  const itemsRes = await pool.query<{
    kind: string;
    name: string;
    description: string | null;
    quantity: string;
    unit_price_cents: string;
    discount_cents: string;
  }>(
    `SELECT kind, name, description, quantity, unit_price_cents, discount_cents
     FROM public.service_order_items
     WHERE service_order_id = $1 AND tenant_id = $2
     ORDER BY sort_order ASC, created_at ASC`,
    [params.serviceOrderId, params.tenantId],
  );

  const totalCents =
    typeof order.total_cents === 'string'
      ? parseInt(order.total_cents, 10) || 0
      : Number(order.total_cents) || 0;

  const items = buildInvoiceItemsFromServiceOrder(itemsRes.rows, {
    number: order.service_order_number,
    total_cents: totalCents,
  });
  const description = buildInvoiceDescriptionFromServiceOrder(
    order.service_order_number,
    order.observations,
  );

  let gatewayRowForPolicy = await getActiveConfig('crm', params.tenantId);
  if (params.gatewayKey) {
    const gr = await pool.query<{
      enabled_payment_methods: unknown;
      default_payment_method: string | null;
    }>(
      `SELECT enabled_payment_methods, default_payment_method
       FROM payment_gateway_configs
       WHERE scope = 'tenant' AND tenant_id = $1 AND gateway_key = $2
         AND is_active = true AND status = 'active'
       LIMIT 1`,
      [params.tenantId, params.gatewayKey],
    );
    if (gr.rows[0]) {
      gatewayRowForPolicy = gr.rows[0] as PaymentGatewayConfigRow;
    }
  }
  const paymentMethodForInvoice = resolveAutomaticInvoicePaymentMethod(
    params.paymentMethod ?? null,
    gatewayRowForPolicy,
  );

  let invoice: CustomerInvoiceRow;
  try {
    const result = await createManualInvoice(params.tenantId, {
      client_id: order.client_id,
      due_date: params.dueDate,
      description,
      payment_method: paymentMethodForInvoice,
      allowed_payment_methods: params.allowedPaymentMethods ?? null,
      gateway_key: params.gatewayKey ?? null,
      items,
      service_order_id: params.serviceOrderId,
      initial_invoice_status: 'waiting_payment',
      currency: order.currency || 'BRL',
    });
    invoice = result.invoice;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate key') || msg.includes('uq_customer_invoices_service_order')) {
      throw new Error('Já existe fatura vinculada a esta ordem de serviço');
    }
    throw e;
  }

  const upd = await pool.query(
    `UPDATE public.service_orders
     SET status = 'invoiced',
         converted_invoice_id = $1,
         updated_at = now()
     WHERE id = $2 AND tenant_id = $3 AND converted_invoice_id IS NULL`,
    [invoice.id, params.serviceOrderId, params.tenantId],
  );
  if ((upd.rowCount ?? 0) === 0) {
    console.error(
      '[convertSignedServiceOrderToInvoice] Fatura criada mas OS não atualizada; reconciliar manualmente.',
      { serviceOrderId: params.serviceOrderId, invoiceId: invoice.id },
    );
  }

  try {
    const client = await pool.connect();
    try {
      await insertServiceOrderEvent(client, {
        tenantId: params.tenantId,
        serviceOrderId: params.serviceOrderId,
        eventType: 'invoice_created',
        payload: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number ?? null,
        },
        createdBy: params.actorUserId,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn('[convertSignedServiceOrderToInvoice] event insert failed', e);
  }

  return { invoice };
}

function pickDueDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function notifyServiceOrderOwner(params: {
  userId: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    await createNotification({
      userId: params.userId,
      type: 'invoice_created',
      title: params.title.slice(0, 255),
      message: params.message,
      data: { ...params.data, module: 'service_orders' },
    });
  } catch (e) {
    console.error('[notifyServiceOrderOwner]', e);
  }
}

/**
 * Pós-assinatura: se billing_mode=auto_on_sign, tenta gerar fatura (best-effort; não reverte assinatura).
 */
export async function maybeAutoInvoiceAfterServiceOrderSigned(params: {
  tenantId: string;
  serviceOrderId: string;
}): Promise<void> {
  const order = await loadServiceOrderForConversion(params.tenantId, params.serviceOrderId);
  if (!order) return;
  if (order.billing_mode !== 'auto_on_sign') return;
  if (order.converted_invoice_id) return;
  if (!order.client_id) {
    await notifyServiceOrderOwner({
      userId: order.created_by,
      title: 'Fatura automática não executada',
      message:
        'A OS foi assinada, mas não há cliente vinculado. Associe o cliente e use "Gerar fatura" no painel.',
      data: { service_order_id: params.serviceOrderId, event: 'auto_invoice_skipped_no_client' },
    });
    return;
  }

  try {
    await convertSignedServiceOrderToInvoice({
      tenantId: params.tenantId,
      actorUserId: order.created_by,
      serviceOrderId: params.serviceOrderId,
      dueDate: pickDueDatePlusDays(14),
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await notifyServiceOrderOwner({
      userId: order.created_by,
      title: 'Fatura automática falhou',
      message: `Assinatura registada, mas a fatura automática falhou: ${m.slice(0, 240)}`,
      data: { service_order_id: params.serviceOrderId, event: 'auto_invoice_failed' },
    });
  }
}
