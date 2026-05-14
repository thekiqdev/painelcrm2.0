/**
 * Operações administrativas em faturas CRM: editar/cancelar/excluir com sincronização no gateway (Asaas).
 */
import { pool } from '../utils/db.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { getInvoiceById, getProjectFinanceScope } from './customerBillingService.js';
import { getCustomerInvoiceSchema } from './customerInvoiceSchema.js';
import { hasInvoicePaymentAttemptsTable } from './customerInvoicePaymentAttemptsService.js';
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
/** Faturas de assinatura já encerradas no fluxo (sem cobrança ativa) — podem ser removidas do CRM a pedido do utilizador. */
const SUBSCRIPTION_INVOICE_PURGEABLE_STATUSES = new Set(['cancelled', 'failed']);

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
  project_id?: string | null;
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
      body.allowed_payment_methods !== undefined ||
      body.project_id !== undefined
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
  const wantsProject = body.project_id !== undefined;

  if (
    !wantsDescription &&
    !wantsDue &&
    !wantsAmount &&
    body.items === undefined &&
    !wantsPaymentMethod &&
    !wantsAllowedMethods &&
    !wantsProject
  ) {
    const row = await getInvoiceById(tenantId, invoiceId);
    if (!row) throw new Error('Fatura não encontrada');
    return row;
  }

  const invAfter = await getInvoiceById(tenantId, invoiceId);
  if (!invAfter) throw new Error('Fatura não encontrada');

  if (wantsProject && body.project_id) {
    const project = await getProjectFinanceScope(tenantId, body.project_id);
    if (!project) throw new Error('Projeto não pertence à empresa');
    if (invAfter.client_id && project.client_id && invAfter.client_id !== project.client_id) {
      throw new Error('Cliente da fatura não corresponde ao cliente do projeto');
    }
  }

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
  if (wantsProject) {
    sets.push(`project_id = $${i}`);
    params.push(body.project_id ?? null);
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
    if (!SUBSCRIPTION_INVOICE_PURGEABLE_STATUSES.has(inv.status)) {
      throw new Error(
        'Faturas de assinatura só podem ser excluídas quando estão canceladas ou falhadas (cobrança já encerrada). Para faturas ativas, use cancelar fatura.'
      );
    }
    await deleteCustomerInvoiceChildrenAndItemsThenRow(tenantId, invoiceId);
    return;
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

function isMissingSubscriptionCyclesTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return (
    code === '42P01' ||
    (/subscription_cycles/i.test(msg) && /does not exist/i.test(msg))
  );
}

async function detachSubscriptionCyclesInvoiceRef(tenantId: string, invoiceId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE subscription_cycles SET invoice_id = NULL WHERE tenant_id = $1 AND invoice_id = $2::uuid`,
      [tenantId, invoiceId]
    );
  } catch (e: unknown) {
    if (isMissingSubscriptionCyclesTable(e)) return;
    throw e;
  }
}

async function deletePaymentAttemptsForInvoice(invoiceId: string): Promise<void> {
  if (!(await hasInvoicePaymentAttemptsTable())) return;
  await pool.query(`DELETE FROM customer_invoice_payment_attempts WHERE invoice_id = $1`, [invoiceId]);
}

/** Exclusão física de uma fatura (itens, tentativas, desvincular ciclos) — sem chamada ao gateway. */
async function purgeOneCustomerInvoiceRow(tenantId: string, invoiceId: string): Promise<void> {
  await detachSubscriptionCyclesInvoiceRef(tenantId, invoiceId);
  await deletePaymentAttemptsForInvoice(invoiceId);
  await pool.query(`DELETE FROM customer_invoice_items WHERE invoice_id = $1`, [invoiceId]);
  await pool.query(`DELETE FROM customer_invoices WHERE id = $1 AND tenant_id = $2`, [invoiceId, tenantId]);
}

/**
 * Remove faturas filhas (E2) e, por fim, a principal — evita violação de FK.
 */
async function deleteCustomerInvoiceChildrenAndItemsThenRow(tenantId: string, invoiceId: string): Promise<void> {
  const schema = await getCustomerInvoiceSchema();
  const childIds: string[] = [];
  if (schema.hasParentInvoiceColumns) {
    const ch = await pool.query<{ id: string }>(
      `SELECT id::text FROM customer_invoices WHERE tenant_id = $1 AND parent_invoice_id = $2`,
      [tenantId, invoiceId]
    );
    childIds.push(...ch.rows.map((r) => r.id));
  }
  for (const cid of childIds) {
    await purgeOneCustomerInvoiceRow(tenantId, cid);
  }
  await purgeOneCustomerInvoiceRow(tenantId, invoiceId);
}
