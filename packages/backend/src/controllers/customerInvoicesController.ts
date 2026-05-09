/**
 * Customer Billing: faturas do tenant (customer_invoices).
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
  getCustomerInvoicesSummary,
  type ListCustomerInvoicesFilters,
} from '../services/customerBillingService.js';
import {
  isCrmGatewayActiveForTenant,
  validateInvoicePreconditions,
} from '../services/customerInvoicePreconditions.js';
import { getActiveConfig } from '../services/paymentGatewayConfigService.js';
import { paymentMethodSlugsFromConfigRow } from '../services/gatewayPaymentMethodPolicy.js';
import { getCustomerInvoiceItems } from '../services/customerInvoiceService.js';
import {
  patchCustomerInvoiceWithGateway,
  deleteCustomerInvoiceWithGateway,
} from '../services/customerInvoiceAdminService.js';
import { getCustomerInvoiceRecurrenceInsight } from '../services/customerInvoiceRecurrenceInsightService.js';
import { patchCustomerSubscriptionNextBillingFromPaidInvoice } from '../services/customerInvoiceRecurrenceNextBillingService.js';
import { ensureTenantOverdueStatusesFresh } from '../services/billingOverdueStatusService.js';
import { createMercadoPagoCheckoutPreferenceForInvoice } from '../services/mercadoPagoCustomerInvoicePaymentService.js';
import { assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import type { PermissionCatalogKey } from '../permissions/permissionCatalog.js';

async function requirePermKey(req: AuthRequest, key: PermissionCatalogKey, res: Response): Promise<boolean> {
  try {
    await assertPermissionKey(req.userId, key, req);
    return true;
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return false;
    }
    throw e;
  }
}

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
  cycles_unlimited: z.boolean().optional(),
  max_cycles: z.number().int().positive().nullable().optional(),
})
  .refine((data) => (data.items?.length ?? 0) > 0 || (data.amount_cents != null && data.amount_cents >= 1), {
    message: 'Informe amount_cents ou pelo menos um item',
    path: ['amount_cents'],
  })
  .refine((data) => !data.recurring || (data.billing_interval != null), {
    message: 'Para fatura recorrente informe billing_interval (monthly, quarterly, semi_annual, yearly)',
    path: ['billing_interval'],
  })
  .superRefine((data, ctx) => {
    if (data.recurring !== true) return;
    const unlimited = data.cycles_unlimited !== false;
    if (!unlimited && (data.max_cycles == null || data.max_cycles < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe max_cycles > 0 quando cycles_unlimited é false',
        path: ['max_cycles'],
      });
    }
  });

/** GET /api/customer-invoices/gateway-status — se o gateway CRM está ativo (alinha a validateInvoicePreconditions). Fase 1. */
export async function getCustomerInvoicesGatewayStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_invoices', res))) return;
    const gatewayConfigured = await isCrmGatewayActiveForTenant(tenantId);
    const cfg = await getActiveConfig('crm', tenantId);
    const pm = paymentMethodSlugsFromConfigRow(cfg);
    res.json({
      gatewayConfigured,
      enabled_payment_methods: pm.enabled_payment_methods,
      default_payment_method: pm.default_payment_method,
    });
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
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.create_invoice', res))) return;

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
      res.status(404).json({ error: 'Cliente não encontrado ou não pertence à empresa' });
      return;
    }

    const result = await validateInvoicePreconditions(tenantId, parsed.data);
    res.json(result);
  } catch (err) {
    console.error('[customerInvoicesController] getCustomerInvoicePreconditions error:', err);
    res.status(500).json({ error: 'Erro ao verificar pré-condições' });
  }
}

/** GET /api/customer-invoices/summary — totais por estado (tenant), para cards no painel. */
export async function getCustomerInvoicesSummaryHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_invoices', res))) return;
    await ensureTenantOverdueStatusesFresh(tenantId).catch((err) =>
      console.error('[customerInvoicesController] getCustomerInvoicesSummaryHandler overdue sync:', err)
    );
    const summary = await getCustomerInvoicesSummary(tenantId);
    res.json(summary);
  } catch (err) {
    console.error('[customerInvoicesController] getCustomerInvoicesSummaryHandler error:', err);
    res.status(500).json({ error: 'Erro ao carregar resumo de faturas' });
  }
}

/** GET /api/customer-invoices — lista faturas do tenant (filtros: client_id?, status?, status_in?, limit?, offset?). */
export async function listCustomerInvoices(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_invoices', res))) return;
    await ensureTenantOverdueStatusesFresh(tenantId).catch((err) =>
      console.error('[customerInvoicesController] listCustomerInvoices overdue sync:', err)
    );

    const { client_id, status, status_in, limit, offset } = req.query;
    const filters: ListCustomerInvoicesFilters = {};
    if (typeof client_id === 'string') filters.client_id = client_id;
    const statusInParts: string[] = [];
    if (typeof status_in === 'string' && status_in.trim()) {
      statusInParts.push(...status_in.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (Array.isArray(status_in)) {
      for (const raw of status_in) {
        if (typeof raw === 'string' && raw.trim()) {
          statusInParts.push(...raw.split(',').map((s) => s.trim()).filter(Boolean));
        }
      }
    }
    if (statusInParts.length > 0) {
      filters.status_in = statusInParts;
    } else if (typeof status === 'string' && status.trim()) {
      filters.status = status;
    }
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
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_invoices', res))) return;
    await ensureTenantOverdueStatusesFresh(tenantId).catch((err) =>
      console.error('[customerInvoicesController] getCustomerInvoiceById overdue sync:', err)
    );

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

/** GET /api/customer-invoices/:id/recurrence-insight — estado da recorrência para UI (assinatura + último job). */
export async function getCustomerInvoiceRecurrenceInsightHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_invoices', res))) return;
    const { id } = req.params;
    const insight = await getCustomerInvoiceRecurrenceInsight(tenantId, id);
    res.json(insight);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Fatura não encontrada') {
      res.status(404).json({ error: 'Fatura não encontrada' });
      return;
    }
    console.error('[customerInvoicesController] getCustomerInvoiceRecurrenceInsightHandler error:', err);
    res.status(500).json({ error: 'Erro ao carregar insight de recorrência' });
  }
}

/** GET /api/customer-invoices/:id/recurrence-history — histórico por subscription_id (D1). */
export async function getCustomerInvoiceRecurrenceHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.view_invoices', res))) return;
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
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.create_invoice', res))) return;

    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }

    const isRecurring = parsed.data.recurring === true && parsed.data.billing_interval != null;

    const result = isRecurring
      ? await createRecurringManualInvoice(tenantId, {
          client_id: parsed.data.client_id ?? null,
          amount_cents: parsed.data.amount_cents,
          due_date: parsed.data.due_date,
          description: parsed.data.description ?? null,
          payment_method: parsed.data.payment_method ?? null,
          allowed_payment_methods: parsed.data.allowed_payment_methods ?? null,
          gateway_key: parsed.data.gateway_key ?? null,
          billing_interval: parsed.data.billing_interval!,
          items: parsed.data.items,
          cycles_unlimited: parsed.data.cycles_unlimited,
          max_cycles: parsed.data.max_cycles ?? null,
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
    if (err instanceof Error && err.message === 'Cliente não pertence à empresa') {
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
    if (
      err instanceof Error &&
      (err.message.includes('não está habilitado') ||
        err.message.includes('métodos permitidos na fatura') ||
        err.message.includes('Método de pagamento selecionado'))
    ) {
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
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }

    const { id } = req.params;
    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }

    const invoicePatchPerm: PermissionCatalogKey =
      parsed.data.status === 'cancelled' ? 'billing.cancel_invoice' : 'billing.edit_invoice';
    if (!(await requirePermKey(req, invoicePatchPerm, res))) return;

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

const patchRecurrenceNextBillingBodySchema = z.object({
  next_billing_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'next_billing_date deve ser YYYY-MM-DD'),
});

/**
 * PATCH /api/customer-invoices/:id/recurrence/next-billing
 * Atualiza `subscriptions.next_billing_date` (fatura paga + origin subscription); cancela jobs pendentes obsoletos;
 * tenta enfileirar job de imediato quando o ciclo já é elegível (CURRENT_DATE + janela local Fase 2), reativando
 * linhas `cancelled`/`failed` do mesmo `cycle_key` se necessário.
 */
export async function patchCustomerInvoiceRecurrenceNextBilling(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.edit_subscription', res))) return;

    const { id } = req.params;
    const parsed = patchRecurrenceNextBillingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }

    const result = await patchCustomerSubscriptionNextBillingFromPaidInvoice({
      tenantId,
      invoiceId: id,
      nextBillingDateYmd: parsed.data.next_billing_date,
      actorUserId: req.userId ?? null,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Fatura não encontrada') {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg.startsWith('Só é possível') ||
      msg.startsWith('Reagendar') ||
      msg.startsWith('Operação disponível') ||
      msg.startsWith('Assinatura não está') ||
      msg.startsWith('Assinatura não encontrada') ||
      msg.startsWith('Fatura sem') ||
      msg.startsWith('next_billing_date')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[customerInvoicesController] patchCustomerInvoiceRecurrenceNextBilling error:', err);
    res.status(500).json({ error: 'Erro ao atualizar próxima cobrança' });
  }
}

const mercadoPagoCreatePaymentBodySchema = z.object({
  regenerate: z.boolean().optional(),
});

/**
 * POST /api/customer-invoices/:id/mercado-pago/create-payment
 * Fase 3 — Checkout Pro (preferência); não marca paga; não altera Asaas na fatura com cobrança Asaas ativa.
 */
export async function postCustomerInvoiceMercadoPagoCreatePayment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.send_invoice', res))) return;
    const { id: invoiceId } = req.params;
    if (!invoiceId || !z.string().uuid().safeParse(invoiceId).success) {
      res.status(400).json({ error: 'ID da fatura inválido' });
      return;
    }
    const parsed = mercadoPagoCreatePaymentBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const result = await createMercadoPagoCheckoutPreferenceForInvoice({
      tenantId,
      invoiceId,
      regenerate: parsed.data.regenerate === true,
    });
    res.json({
      preference_id: result.preference_id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
      payment_url: result.payment_url,
      invoice_url: result.invoice_url,
      cached: result.cached,
      oauth_environment: result.oauth_environment,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar cobrança Mercado Pago';
    if (msg.includes('não encontrada')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg.includes('já está paga') ||
      msg.includes('não permite') ||
      msg.includes('Conecte o Mercado Pago') ||
      msg.includes('desativado') ||
      msg.includes('payment_token') ||
      msg.includes('Estado da fatura') ||
      msg.includes('Mercado Pago está desativado') ||
      msg.includes('sem preference id')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('[customerInvoicesController] postCustomerInvoiceMercadoPagoCreatePayment error:', err);
    res.status(500).json({ error: 'Erro ao gerar cobrança Mercado Pago' });
  }
}

/** DELETE /api/customer-invoices/:id — exclui fatura manual (gateway) ou fatura de assinatura cancelada/falhada (apenas registro). */
export async function deleteCustomerInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Empresa não identificada' });
      return;
    }
    if (!(await requirePermKey(req, 'billing.delete_invoice', res))) return;
    const { id } = req.params;
    await deleteCustomerInvoiceWithGateway(tenantId, id);
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Fatura não encontrada') {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg.startsWith('Faturas geradas') ||
      msg.startsWith('Só é possível excluir') ||
      msg.startsWith('Faturas de assinatura só podem ser excluídas')
    ) {
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
