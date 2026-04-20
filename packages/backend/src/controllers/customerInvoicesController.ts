/**
 * Customer Billing: faturas do tenant para seus clientes (customer_invoices).
 * Todas as rotas exigem tenantAuth; list e get filtram por tenant_id.
 */
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import {
  createManualInvoice,
  createRecurringManualInvoice,
  listInvoices,
  getInvoiceById,
  listRecurrenceHistoryForInvoice,
  clientBelongsToTenant,
  PreconditionFailedError,
  type ListCustomerInvoicesFilters,
} from '../services/customerBillingService.js';
import {
  isCrmGatewayActiveForTenant,
  validateInvoicePreconditions,
} from '../services/customerInvoicePreconditions.js';
import { getCustomerInvoiceItems } from '../services/customerInvoiceService.js';
import {
  patchCustomerInvoiceWithGateway,
  deleteCustomerInvoiceWithGateway,
} from '../services/customerInvoiceAdminService.js';

const createItemSchema = z.object({
  description: z.string().min(1, 'Descrição é obrigatória'),
  quantity: z.number().positive('Quantidade deve ser positiva'),
  unit_price_cents: z.number().int().min(0, 'Valor unitário não pode ser negativo'),
  discount_cents: z.number().int().min(0).optional(),
  product_id: z.string().uuid().optional().nullable(),
  is_recurring: z.boolean().optional(),
  recurring_interval: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly']).optional().nullable(),
  scheduled_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const billingIntervalSchema = z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']);
const paymentMethodSchema = z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']);

const createBodySchema = z.object({
  client_id: z.string().uuid('client_id inválido').optional().nullable(),
  amount_cents: z.number().int().min(1, 'amount_cents deve ser positivo').optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date deve ser YYYY-MM-DD'),
  description: z.string().optional().nullable(),
  payment_method: paymentMethodSchema.optional().nullable(),
  allowed_payment_methods: z.array(paymentMethodSchema).min(1).max(3).optional().nullable(),
  /** Fase 3 — Seleção explícita de gateway (C1, opcional). */
  gateway_key: z.string().optional().nullable(),
  items: z.array(createItemSchema).optional(),
  recurring: z.boolean().optional(),
  billing_interval: billingIntervalSchema.optional(),
  charge_id: z.string().uuid('charge_id inválido').optional().nullable(),
})
  .refine((data) => (data.items?.length ?? 0) > 0 || (data.amount_cents != null && data.amount_cents >= 1), {
    message: 'Informe amount_cents ou pelo menos um item',
    path: ['amount_cents'],
  })
  .refine((data) => !data.recurring || (data.billing_interval != null), {
    message: 'Para fatura recorrente informe billing_interval (monthly, quarterly, semi_annual, yearly)',
    path: ['billing_interval'],
  })
  .refine((data) => data.recurring !== true || (data.client_id != null && data.client_id !== ''), {
    message: 'Fatura recorrente exige cliente',
    path: ['client_id'],
  });

/** GET /api/customer-invoices/gateway-status — se o gateway CRM está ativo (alinha a validateInvoicePreconditions). Fase 1. */
export async function getCustomerInvoicesGatewayStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }
    const gatewayConfigured = await isCrmGatewayActiveForTenant(tenantId);
    res.json({ gatewayConfigured });
  } catch (err) {
    console.error('[customerInvoicesController] getCustomerInvoicesGatewayStatus error:', err);
    res.status(500).json({ error: 'Erro ao verificar gateway' });
  }
}

/** GET /api/customer-invoices/preconditions?client_id=... — estado das pré-condições para criar fatura (Fase 3). */
export async function getCustomerInvoicePreconditions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }

    const clientId = typeof req.query.client_id === 'string' ? req.query.client_id.trim() : null;
    if (!clientId) {
      res.status(400).json({ error: 'client_id é obrigatório na query' });
      return;
    }
    const uuidSchema = z.string().uuid();
    const parsed = uuidSchema.safeParse(clientId);
    if (!parsed.success) {
      res.status(400).json({ error: 'client_id inválido' });
      return;
    }

    const belongs = await clientBelongsToTenant(tenantId, parsed.data);
    if (!belongs) {
      res.status(404).json({ error: 'Cliente não encontrado ou não pertence ao tenant' });
      return;
    }

    const result = await validateInvoicePreconditions(tenantId, parsed.data);
    res.json(result);
  } catch (err) {
    console.error('[customerInvoicesController] getCustomerInvoicePreconditions error:', err);
    res.status(500).json({ error: 'Erro ao verificar pré-condições' });
  }
}

/** GET /api/customer-invoices — lista faturas do tenant (filtros: client_id?, status?, limit?, offset?). */
export async function listCustomerInvoices(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }

    const { client_id, status, limit, offset } = req.query;
    const filters: ListCustomerInvoicesFilters = {};
    if (typeof client_id === 'string') filters.client_id = client_id;
    if (typeof status === 'string') filters.status = status;
    if (typeof limit === 'string') filters.limit = parseInt(limit, 10);
    if (typeof offset === 'string') filters.offset = parseInt(offset, 10);

    const invoices = await listInvoices(tenantId, filters);
    res.json(invoices);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[customerInvoicesController] listCustomerInvoices error:', msg, err);
    res.status(500).json({ error: 'Erro ao listar faturas' });
  }
}

/** GET /api/customer-invoices/:id — detalhe de uma fatura (somente se pertencer ao tenant). */
export async function getCustomerInvoiceById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }

    const { id } = req.params;
    const invoice = await getInvoiceById(tenantId, id);
    if (!invoice) {
      res.status(404).json({ error: 'Fatura não encontrada' });
      return;
    }
    const items = await getCustomerInvoiceItems(id, tenantId);
    res.json({ ...invoice, items });
  } catch (err) {
    console.error('[customerInvoicesController] getCustomerInvoiceById error:', err);
    res.status(500).json({ error: 'Erro ao buscar fatura' });
  }
}

/** GET /api/customer-invoices/:id/recurrence-history — histórico por subscription_id (D1). */
export async function getCustomerInvoiceRecurrenceHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }
    const { id } = req.params;
    const invoice = await getInvoiceById(tenantId, id);
    if (!invoice) {
      res.status(404).json({ error: 'Fatura não encontrada' });
      return;
    }
    const history = await listRecurrenceHistoryForInvoice(tenantId, id);
    res.json({ subscription_id: invoice.subscription_id, history });
  } catch (err) {
    console.error('[customerInvoicesController] getCustomerInvoiceRecurrenceHistory error:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico de recorrência' });
  }
}

/** POST /api/customer-invoices — cria fatura manual e cobrança no gateway. */
export async function createCustomerInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }

    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }

    const isRecurring = parsed.data.recurring === true && parsed.data.billing_interval != null;

    const result = isRecurring
      ? await createRecurringManualInvoice(tenantId, {
          client_id: parsed.data.client_id!,
          amount_cents: parsed.data.amount_cents,
          due_date: parsed.data.due_date,
          description: parsed.data.description ?? null,
          payment_method: parsed.data.payment_method ?? null,
          allowed_payment_methods: parsed.data.allowed_payment_methods ?? null,
          gateway_key: parsed.data.gateway_key ?? null,
          billing_interval: parsed.data.billing_interval!,
          items: parsed.data.items,
        })
      : await createManualInvoice(tenantId, {
          client_id: parsed.data.client_id,
          amount_cents: parsed.data.amount_cents,
          due_date: parsed.data.due_date,
          description: parsed.data.description ?? null,
          payment_method: parsed.data.payment_method ?? null,
          allowed_payment_methods: parsed.data.allowed_payment_methods ?? null,
          items: parsed.data.items,
          gateway_key: parsed.data.gateway_key ?? null,
          charge_id: parsed.data.charge_id ?? null,
        });

    res.status(201).json({
      invoice: result.invoice,
      paymentUrls: result.paymentUrls ?? undefined,
      subscription_id: result.subscription_id ?? undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Cliente não pertence ao tenant') {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof PreconditionFailedError) {
      res.status(400).json({ code: err.code, errors: err.errors });
      return;
    }
    if (err instanceof Error && err.message === 'Gateway de pagamento não configurado') {
      res.status(503).json({ error: err.message });
      return;
    }
    if (err instanceof Error && (err.message === 'Cliente não encontrado' || err.message === 'Não foi possível obter ou criar o cliente no gateway de pagamento')) {
      res.status(400).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[customerInvoicesController] createCustomerInvoice error:', msg, err);
    res.status(500).json({ error: 'Erro ao criar fatura', ...(process.env.NODE_ENV !== 'production' ? { detail: msg } : {}) });
  }
}

const patchBodySchema = z
  .object({
    description: z.string().optional().nullable(),
    status: z.literal('cancelled').optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    amount_cents: z.number().int().min(1).optional(),
    items: z.array(createItemSchema).optional(),
    payment_method: paymentMethodSchema.optional().nullable(),
    allowed_payment_methods: z.array(paymentMethodSchema).min(1).max(3).optional().nullable(),
  })
  .refine(
    (d) =>
      d.status === 'cancelled' ||
      d.description !== undefined ||
      d.due_date !== undefined ||
      d.amount_cents !== undefined ||
      d.items !== undefined ||
      d.payment_method !== undefined ||
      d.allowed_payment_methods !== undefined,
    { message: 'Informe ao menos um campo para atualizar' }
  )
  .superRefine((d, ctx) => {
    if (d.items && d.items.length === 0 && d.amount_cents == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ao enviar itens vazio, informe amount_cents com o valor total',
        path: ['amount_cents'],
      });
    }
  });

/** PATCH /api/customer-invoices/:id — edita descrição/vencimento/valor (com sync no Asaas) ou cancela (cancela cobrança no gateway primeiro). */
export async function updateCustomerInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }

    const { id } = req.params;
    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }

    const updated = await patchCustomerInvoiceWithGateway(tenantId, id, parsed.data);
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Fatura não encontrada') {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg.startsWith('Não é possível') ||
      msg.startsWith('Só é possível') ||
      msg.startsWith('Fatura com itens') ||
      msg.startsWith('Gateway de pagamento não suporta') ||
      msg.startsWith('Não combine cancelamento')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[customerInvoicesController] updateCustomerInvoice error:', err);
    res.status(500).json({
      error: 'Erro ao atualizar fatura',
      ...(process.env.NODE_ENV !== 'production' ? { detail: msg } : {}),
    });
  }
}

/** DELETE /api/customer-invoices/:id — exclui fatura manual e remove/cancela cobrança no Asaas. Faturas de assinatura (origin=subscription) não podem ser excluídas. */
export async function deleteCustomerInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Tenant não identificado' });
      return;
    }
    const { id } = req.params;
    await deleteCustomerInvoiceWithGateway(tenantId, id);
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Fatura não encontrada') {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.startsWith('Faturas geradas') || msg.startsWith('Só é possível excluir')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[customerInvoicesController] deleteCustomerInvoice error:', err);
    res.status(500).json({
      error: 'Erro ao excluir fatura',
      ...(process.env.NODE_ENV !== 'production' ? { detail: msg } : {}),
    });
  }
}
