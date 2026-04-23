/**
 * Operações administrativas em faturas CRM: editar/cancelar/excluir com sincronização no gateway (Asaas).
 */
import { pool } from '../utils/db.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { getInvoiceById } from './customerBillingService.js';
import {
  countCustomerInvoiceItems,
  replaceManualInvoiceLineItems,
  updateCustomerInvoiceGatewayData,
  updateCustomerInvoiceStatus,
  type CreateManualCustomerInvoiceItemInput,
  type CustomerInvoiceRow,
} from './customerInvoiceService.js';
import { resolveCrmGatewayForTenantInvoice } from './invoicePaymentAttemptReuseService.js';

const CANCELLABLE_STATUSES = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);
const EDITABLE_STATUSES = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);
const DELETABLE_STATUSES = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);

export interface PatchCustomerInvoiceBody {
  description?: string | null;
  due_date?: string;
  amount_cents?: number;
  status?: 'cancelled';
  /** Substitui linhas (fatura manual). Exige `amount_cents` se o array for vazio (valor único). */
  items?: CreateManualCustomerInvoiceItemInput[];
  payment_method?: string | null;
  /** Persistido em gateway_metadata.allowed_payment_methods */
  allowed_payment_methods?: string[] | null;
}

export async function patchCustomerInvoiceWithGateway(
  tenantId: string,
  invoiceId: string,
  body: PatchCustomerInvoiceBody
): Promise<CustomerInvoiceRow> {
  const inv = await getInvoiceById(tenantId, invoiceId);
  if (!inv) {
    throw new Error('Fatura não encontrada');
  }

  if (body.status === 'cancelled') {
    if (
      body.description !== undefined ||
      body.due_date !== undefined ||
      body.amount_cents !== undefined ||
      body.items !== undefined ||
      body.payment_method !== undefined ||
      body.allowed_payment_methods !== undefined
    ) {
      throw new Error('Não é possível cancelar e alterar outros campos na mesma requisição');
    }
    if (!CANCELLABLE_STATUSES.has(inv.status)) {
      throw new Error('Só é possível cancelar fatura pendente ou em cobrança');
    }
    if (inv.gateway_reference_id) {
      const { gateway } = await resolveCrmGatewayForTenantInvoice(tenantId, inv.gateway);
      if (gateway.cancelPayment) {
        await gateway.cancelPayment(inv.gateway_reference_id);
      }
    }
    await updateCustomerInvoiceStatus(invoiceId, 'cancelled', undefined, null);
    const row = await getInvoiceById(tenantId, invoiceId);
    if (!row) throw new Error('Fatura não encontrada após cancelamento');
    return row;
  }

  if (!EDITABLE_STATUSES.has(inv.status)) {
    throw new Error('Só é possível editar fatura pendente ou em cobrança');
  }

  const itemCountBefore = await countCustomerInvoiceItems(invoiceId, tenantId);
  if (body.items === undefined && body.amount_cents !== undefined && itemCountBefore > 0) {
    throw new Error(
      'Fatura com itens: envie o array `items` atualizado ou altere apenas vencimento/descrição sem `amount_cents`.'
    );
  }

  let amountAfterItems: number | null = null;
  if (body.items !== undefined) {
    amountAfterItems = await replaceManualInvoiceLineItems(
      tenantId,
      invoiceId,
      body.items,
      body.items.length === 0 ? body.amount_cents : undefined
    );
  }

  const wantsDescription = body.description !== undefined;
  const wantsDue = body.due_date !== undefined;
  const wantsAmount =
    body.amount_cents !== undefined && body.items === undefined;
  const wantsPaymentMethod = body.payment_method !== undefined;
  const wantsAllowedMethods = body.allowed_payment_methods !== undefined;

  if (
    !wantsDescription &&
    !wantsDue &&
    !wantsAmount &&
    body.items === undefined &&
    !wantsPaymentMethod &&
    !wantsAllowedMethods
  ) {
    const row = await getInvoiceById(tenantId, invoiceId);
    if (!row) throw new Error('Fatura não encontrada');
    return row;
  }

  const invAfter = await getInvoiceById(tenantId, invoiceId);
  if (!invAfter) throw new Error('Fatura não encontrada');

  if (inv.gateway_reference_id) {
    const { gatewayKey, gateway } = await resolveCrmGatewayForTenantInvoice(tenantId, inv.gateway);
    const patch: {
      amountCents?: number;
      dueDate?: string;
      description?: string;
    } = {};
    if (amountAfterItems != null) {
      patch.amountCents = amountAfterItems;
    } else if (wantsAmount) {
      patch.amountCents = body.amount_cents;
    }
    if (wantsDue) patch.dueDate = body.due_date;
    if (wantsDescription) patch.description = body.description ?? '';

    if (Object.keys(patch).length > 0) {
      if (!gateway.updateCharge) {
        throw new Error('Gateway de pagamento não suporta atualizar cobrança (valor/vencimento/descrição)');
      }
      const pm = (wantsPaymentMethod ? body.payment_method : invAfter.payment_method) as PaymentMethod | null;
      const updated = await gateway.updateCharge(inv.gateway_reference_id, patch, {
        paymentMethod: pm ?? undefined,
      });
      await updateCustomerInvoiceGatewayData(invoiceId, {
        gateway: gatewayKey,
        payment_method: (wantsPaymentMethod ? body.payment_method ?? null : invAfter.payment_method) as
          | string
          | null,
        gateway_reference_id: inv.gateway_reference_id,
        gateway_status: updated.status,
        gateway_metadata: {
          invoiceUrl: updated.invoiceUrl,
          bankSlipUrl: updated.bankSlipUrl,
          bankSlipDigitableLine: updated.bankSlipDigitableLine,
          pixQrCode: updated.pixQrCode,
          pixCopyPaste: updated.pixCopyPaste,
          ...(wantsAllowedMethods && body.allowed_payment_methods != null
            ? { allowed_payment_methods: body.allowed_payment_methods }
            : {}),
        },
      });
    } else if (wantsPaymentMethod || wantsAllowedMethods) {
      await updateCustomerInvoiceGatewayData(invoiceId, {
        gateway: gatewayKey,
        payment_method: (wantsPaymentMethod ? body.payment_method ?? null : invAfter.payment_method) as
          | string
          | null,
        gateway_reference_id: inv.gateway_reference_id,
        gateway_status: invAfter.gateway_status,
        gateway_metadata: wantsAllowedMethods
          ? { allowed_payment_methods: body.allowed_payment_methods ?? [] }
          : undefined,
      });
    }
  } else if (wantsPaymentMethod || wantsAllowedMethods) {
    const cur = await pool.query<{ gateway_metadata: Record<string, unknown> | null }>(
      `SELECT gateway_metadata FROM customer_invoices WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [invoiceId, tenantId]
    );
    const prev = cur.rows[0]?.gateway_metadata ?? {};
    const nextMeta = { ...prev };
    if (wantsAllowedMethods) {
      nextMeta.allowed_payment_methods = body.allowed_payment_methods ?? [];
    }
    await pool.query(
      `UPDATE customer_invoices
       SET payment_method = COALESCE($1::text, payment_method),
           gateway_metadata = $2::jsonb,
           updated_at = now()
       WHERE id = $3 AND tenant_id = $4`,
      [
        wantsPaymentMethod ? body.payment_method : null,
        JSON.stringify(nextMeta),
        invoiceId,
        tenantId,
      ]
    );
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (wantsDescription) {
    sets.push(`description = $${i}`);
    params.push(body.description);
    i++;
  }
  if (wantsDue) {
    sets.push(`due_date = $${i}`);
    params.push(body.due_date);
    i++;
  }
  if (wantsAmount) {
    sets.push(`amount_cents = $${i}`);
    params.push(body.amount_cents);
    i++;
  }
  if (wantsPaymentMethod) {
    sets.push(`payment_method = $${i}`);
    params.push(body.payment_method);
    i++;
  }
  if (sets.length > 0) {
    params.push(invoiceId, tenantId);
    await pool.query(
      `UPDATE customer_invoices SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i} AND tenant_id = $${i + 1}`,
      params
    );
  }

  const row = await getInvoiceById(tenantId, invoiceId);
  if (!row) throw new Error('Fatura não encontrada');
  return row;
}

export async function deleteCustomerInvoiceWithGateway(
  tenantId: string,
  invoiceId: string
): Promise<void> {
  const inv = await getInvoiceById(tenantId, invoiceId);
  if (!inv) {
    throw new Error('Fatura não encontrada');
  }
  if (inv.origin === 'subscription') {
    throw new Error(
      'Faturas geradas pela assinatura recorrente não podem ser excluídas. Cancele a cobrança ou use cancelamento.'
    );
  }
  if (!DELETABLE_STATUSES.has(inv.status)) {
    throw new Error('Só é possível excluir fatura pendente ou em cobrança');
  }
  if (inv.gateway_reference_id) {
    const { gateway } = await resolveCrmGatewayForTenantInvoice(tenantId, inv.gateway);
    if (gateway.cancelPayment) {
      await gateway.cancelPayment(inv.gateway_reference_id);
    }
  }
  await pool.query(`DELETE FROM customer_invoices WHERE id = $1 AND tenant_id = $2`, [invoiceId, tenantId]);
}
