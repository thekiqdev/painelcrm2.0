/**
 * Rotas públicas para faturas (link único de pagamento). Sem autenticação.
 * GET /api/public/customer-invoices/pay/:token
 * POST /api/public/customer-invoices/pay/:token/complete (Fase 8: preencher cliente e gerar cobrança)
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { getByPaymentToken } from '../services/customerInvoiceService.js';
import { updateCustomerInvoiceStatus } from '../services/customerInvoiceService.js';
import {
  completePaymentByToken,
  switchPaymentMethodByToken,
  payInvoiceWithCardByToken,
  PayWithCardError,
} from '../services/customerBillingService.js';
import { buildPublicPayPayloadMeta } from '../services/publicPayPayloadMeta.js';
import { billingLog } from '../services/billingLogger.js';
import { isPublicPayTelemetryEnabled, isPublicPaySwitchMethodEnabledForTenant } from '../config/publicPayEnv.js';
import { pool } from '../utils/db.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { buildGateway } from '../modules/payments/gatewayRegistry.js';
import { getActiveConfig, getConfigForTest } from '../services/paymentGatewayConfigService.js';
import { mergePublicPayAllowedMethods } from '../services/gatewayPaymentMethodPolicy.js';
import { normalizeGatewayStatus } from '../modules/payments/webhook/statusNormalizer.js';
import { runPostPaidCleanupForCustomerInvoice } from '../services/billingGatewayChargeService.js';
import {
  getActiveInvoicePaymentAttempt,
  listInvoicePaymentAttemptsSummary,
  hasInvoicePaymentAttemptsTable,
} from '../services/customerInvoicePaymentAttemptsService.js';

const completeBodySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  cpf_cnpj: z.string().min(11, 'CPF/CNPJ é obrigatório').max(18, 'CPF/CNPJ inválido'),
  company: z.string().optional().nullable(),
});
const switchMethodBodySchema = z.object({
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
  idempotency_key: z.string().min(1).max(160).optional().nullable(),
});

const payWithCardBodySchema = z.object({
  idempotency_key: z.string().min(8).max(160),
  credit_card: z.object({
    holder_name: z.string().min(2).max(120),
    number: z.string().min(13).max(22),
    expiry_month: z.string().regex(/^\d{1,2}$/),
    expiry_year: z.string().regex(/^\d{4}$/),
    cvv: z.string().min(3).max(4),
  }),
  cardholder: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(200),
    cpf_cnpj: z.string().min(11).max(18),
    postal_code: z.string().min(5).max(12),
    address_number: z.string().min(1).max(20),
    phone: z.string().min(8).max(20),
    address_complement: z.string().max(80).optional().nullable(),
    mobile_phone: z.string().max(20).optional().nullable(),
  }),
});

function getClientIpForPublicPay(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  const rip = req.socket.remoteAddress;
  return rip && rip.length > 0 ? rip : '0.0.0.0';
}

const POLLABLE_STATUSES = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);

/**
 * Gateways podem devolver paidAt como YYYY-MM-DD (sem hora/fuso).
 * Evita deslocamento para o dia anterior ao persistir em timestamptz.
 */
function parseGatewayPaidAtSafe(value: string | null | undefined): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const t = value.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      // Usa meio-dia UTC para preservar o "dia de pagamento" no frontend (pt-BR) sem cair no dia anterior.
      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    }
  }
  const parsed = new Date(t);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function syncPublicInvoiceStatusFromGateway(params: {
  invoiceId: string;
  tenantId: string;
  currentStatus: string;
}): Promise<void> {
  if (!POLLABLE_STATUSES.has(params.currentStatus)) return;

  const row = await pool.query<{
    gateway: string | null;
    gateway_reference_id: string | null;
    status: string;
    paid_at: string | null;
    gateway_status: string | null;
  }>(
    `SELECT gateway, gateway_reference_id, status, paid_at, gateway_status
     FROM customer_invoices
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [params.invoiceId, params.tenantId]
  );
  const invoice = row.rows[0];
  if (!invoice?.gateway) return;
  /** Fase 3–4 MP: sem adapter `getPayment` no registry; evita consultar Asaas com id de preferência MP. */
  if (invoice.gateway === 'mercado_pago') return;

  let gateway = null;
  const gatewayConfig = await getConfigForTest('tenant', params.tenantId, invoice.gateway);
  if (gatewayConfig && gatewayConfig.gateway_key === invoice.gateway) {
    gateway = buildGateway(invoice.gateway, {
      credentials: (gatewayConfig.credentials as Record<string, unknown>) ?? {},
      options: (gatewayConfig.options as Record<string, unknown>) ?? {},
    });
  }
  if (!gateway) {
    // Fallback para manter compatibilidade com o comportamento atual do resolver.
    gateway = await getActiveGateway({ billingType: 'crm', tenantId: params.tenantId });
  }
  if (!gateway?.getPayment) return;

  // Confirmação robusta: se qualquer tentativa (PIX/BOLETO/CREDIT_CARD) estiver como paga no provedor,
  // consolidamos a fatura como paid, sem depender de o usuário estar na aba do método ativo.
  if (await hasInvoicePaymentAttemptsTable()) {
    const attempts = await pool.query<{ gateway_reference_id: string }>(
      `SELECT gateway_reference_id
       FROM customer_invoice_payment_attempts
       WHERE invoice_id = $1
         AND tenant_id = $2
         AND gateway_reference_id IS NOT NULL
         AND payment_method IN ('PIX','BOLETO','CREDIT_CARD')
       `,
      [params.invoiceId, params.tenantId]
    );

    for (const a of attempts.rows) {
      const payment = await gateway.getPayment(a.gateway_reference_id);
      const externalStatus = payment?.status ?? null;
      if (!externalStatus) continue;
      const normalizedStatus = normalizeGatewayStatus(invoice.gateway, externalStatus);
      if (normalizedStatus === 'paid') {
        const paidAt = parseGatewayPaidAtSafe(payment?.paidAt) ?? new Date();
        await updateCustomerInvoiceStatus(params.invoiceId, 'paid', paidAt, externalStatus);
        await runPostPaidCleanupForCustomerInvoice({
          invoiceId: params.invoiceId,
          tenantId: params.tenantId,
          paidGatewayReferenceId: a.gateway_reference_id,
          gatewayStatusRaw: externalStatus,
          paidAt,
        }).catch((err) =>
          console.error('[syncPublicInvoiceStatusFromGateway] runPostPaidCleanupForCustomerInvoice:', err)
        );
        return;
      }
    }
  }

  // Fallback do comportamento anterior: atualiza também pelo gateway_reference_id atualmente persistido na fatura.
  if (!invoice.gateway_reference_id) return;
  const payment = await gateway.getPayment(invoice.gateway_reference_id);
  const externalStatus = payment?.status ?? null;
  if (!externalStatus) return;

  const normalizedStatus = normalizeGatewayStatus(invoice.gateway, externalStatus);
  const shouldUpdateStatus = normalizedStatus !== invoice.status;
  const shouldUpdateGatewayStatus = (invoice.gateway_status ?? '') !== externalStatus;
  const shouldSetPaidAt = normalizedStatus === 'paid' && invoice.paid_at == null;

  if (!shouldUpdateStatus && !shouldUpdateGatewayStatus && !shouldSetPaidAt) return;

  const paidAtForUpdate =
    normalizedStatus === 'paid'
      ? (parseGatewayPaidAtSafe(payment?.paidAt) ?? new Date())
      : undefined;
  await updateCustomerInvoiceStatus(
    params.invoiceId,
    normalizedStatus,
    paidAtForUpdate,
    externalStatus
  );
  if (normalizedStatus === 'paid' && invoice.gateway_reference_id) {
    await runPostPaidCleanupForCustomerInvoice({
      invoiceId: params.invoiceId,
      tenantId: params.tenantId,
      paidGatewayReferenceId: invoice.gateway_reference_id,
      gatewayStatusRaw: externalStatus,
      paidAt: paidAtForUpdate ?? new Date(),
    }).catch((err) =>
      console.error('[syncPublicInvoiceStatusFromGateway] runPostPaidCleanupForCustomerInvoice:', err)
    );
  }
}

export async function getPayByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({ error: 'Token é obrigatório' });
      return;
    }
    const data = await getByPaymentToken(token);
    if (!data) {
      res.status(404).json({ error: 'Fatura não encontrada ou link inválido' });
      return;
    }
    try {
      await syncPublicInvoiceStatusFromGateway({
        invoiceId: data.invoice_id,
        tenantId: data.tenant_id,
        currentStatus: data.invoice.status,
      });
    } catch (syncErr) {
      console.error('getPayByToken syncPublicInvoiceStatusFromGateway:', syncErr);
    }

    const freshData = (await getByPaymentToken(token)) ?? data;
    const { invoice, items, client_name } = freshData;
    const metadata = (invoice.gateway_metadata as Record<string, unknown> | null) ?? {};
    const activeAttempt = await getActiveInvoicePaymentAttempt(freshData.invoice_id);
    const attemptsSummary = await listInvoicePaymentAttemptsSummary(freshData.invoice_id);
    const attemptMeta = (activeAttempt?.gateway_metadata as Record<string, unknown> | null) ?? {};
    const activeMetadata = { ...metadata, ...attemptMeta };
    const mpBlock = activeMetadata.mercado_pago_checkout as Record<string, unknown> | undefined;
    const mpOauthEnv = mpBlock?.oauth_environment === 'sandbox' ? 'sandbox' : 'production';
    const mpFromBlock =
      mpOauthEnv === 'sandbox' && typeof mpBlock?.sandbox_init_point === 'string'
        ? mpBlock.sandbox_init_point
        : typeof mpBlock?.init_point === 'string'
          ? mpBlock.init_point
          : undefined;
    const mercado_pago_init_point =
      (typeof activeMetadata.mercado_pago_payment_url === 'string'
        ? activeMetadata.mercado_pago_payment_url.trim()
        : '') ||
      (typeof mpFromBlock === 'string' ? mpFromBlock.trim() : '') ||
      undefined;
    const payment_urls = {
      invoiceUrl: typeof activeMetadata.invoiceUrl === 'string' ? activeMetadata.invoiceUrl : undefined,
      bankSlipUrl: typeof activeMetadata.bankSlipUrl === 'string' ? activeMetadata.bankSlipUrl : undefined,
      bankSlipDigitableLine:
        typeof activeMetadata.bankSlipDigitableLine === 'string'
          ? activeMetadata.bankSlipDigitableLine
          : undefined,
      pixQrCode: typeof activeMetadata.pixQrCode === 'string' ? activeMetadata.pixQrCode : undefined,
      pixCopyPaste: typeof activeMetadata.pixCopyPaste === 'string' ? activeMetadata.pixCopyPaste : undefined,
      ...(mercado_pago_init_point
        ? { mercado_pago_init_point: mercado_pago_init_point as string }
        : {}),
    };
    const storedMethodsNorm = Array.isArray(activeMetadata.allowed_payment_methods)
      ? ([
          ...new Set(
            (activeMetadata.allowed_payment_methods as string[]).filter(
              (m): m is 'PIX' | 'BOLETO' | 'CREDIT_CARD' =>
                m === 'PIX' || m === 'BOLETO' || m === 'CREDIT_CARD'
            )
          ),
        ] as Array<'PIX' | 'BOLETO' | 'CREDIT_CARD'>)
      : null;
    const crmCfg = await getActiveConfig('crm', freshData.tenant_id);
    const allowed_payment_methods = mergePublicPayAllowedMethods(
      storedMethodsNorm && storedMethodsNorm.length > 0 ? storedMethodsNorm : null,
      crmCfg
    );
    let clientProfile: {
      name: string | null;
      email: string | null;
      phone: string | null;
      company: string | null;
      cpf_cnpj: string | null;
    } | null = null;
    if (freshData.client_id) {
      const clientRow = await pool.query<{
        name: string | null;
        email: string | null;
        phone: string | null;
        company: string | null;
        cpf_cnpj: string | null;
      }>(
        `SELECT c.name, c.email, c.phone, c.company, c.cpf_cnpj
         FROM clients c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
         WHERE c.id = $1
         LIMIT 1`,
        [freshData.client_id, freshData.tenant_id]
      );
      clientProfile = clientRow.rows[0] ?? null;
    }
    const missingLinkedClientCpf =
      !!freshData.client_id &&
      !!clientProfile &&
      (!clientProfile.cpf_cnpj || String(clientProfile.cpf_cnpj).trim() === '');
    const needs_customer = invoice.status === 'pending' && (!client_name || missingLinkedClientCpf);
    const needs_customer_reason = !needs_customer
      ? null
      : !client_name
        ? 'missing_client'
        : 'missing_cpf_cnpj';
    const payloadMeta = buildPublicPayPayloadMeta(payment_urls);

    const mpPaymentSnap = activeMetadata.mercado_pago_payment as Record<string, unknown> | undefined;
    const mercadoPagoPaymentStatus = typeof mpPaymentSnap?.status === 'string' ? mpPaymentSnap.status : null;
    const paidByMercadoPagoMeta = activeMetadata.paid_by_gateway === 'mercado_pago';

    const switchMethodEnabled = isPublicPaySwitchMethodEnabledForTenant(freshData.tenant_id);

    if (isPublicPayTelemetryEnabled()) {
      billingLog('invoice', 'public_pay_get', {
        tenantId: data.tenant_id,
        has_payment_payload: payloadMeta.has_payment_payload,
        payment_options_summary: payloadMeta.payment_options_summary,
        needs_customer,
        status: invoice.status,
        switch_method_enabled: switchMethodEnabled,
      });
    }

    res.json({
      invoice_number: invoice.invoice_number,
      description: invoice.description,
      amount_cents: invoice.amount_cents,
      due_date: invoice.due_date,
      status: invoice.status,
      payment_method: invoice.payment_method,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit_price_cents: i.unit_price_cents,
        discount_cents: i.discount_cents,
        total_cents: i.total_cents,
      })),
      payment_urls,
      allowed_payment_methods,
      active_attempt: activeAttempt
        ? {
            id: activeAttempt.id,
            payment_method: activeAttempt.payment_method,
            status: activeAttempt.status,
            is_active: activeAttempt.is_active,
            created_at: activeAttempt.created_at,
          }
        : null,
      attempts_summary: attemptsSummary.map((a) => ({
        id: a.id,
        payment_method: a.payment_method,
        status: a.status,
        is_active: a.is_active,
        created_at: a.created_at,
      })),
      switch_method_enabled: switchMethodEnabled,
      client_name,
      tenant_branding: freshData.tenant_branding,
      needs_customer,
      needs_customer_reason,
      client_summary: clientProfile
        ? {
            name: clientProfile.name,
            email: clientProfile.email,
            phone: clientProfile.phone,
            company: clientProfile.company,
          }
        : null,
      mercado_pago_public: {
        has_checkout: Boolean(mercado_pago_init_point),
        payment_status: mercadoPagoPaymentStatus,
        paid_by_mercado_pago: paidByMercadoPagoMeta,
      },
      ...payloadMeta,
    });
  } catch (error) {
    console.error('getPayByToken:', error);
    res.status(500).json({ error: 'Erro ao carregar fatura' });
  }
}

export async function postSwitchPaymentMethodByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({ error: 'Token é obrigatório' });
      return;
    }
    const parsed = switchMethodBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const data = await getByPaymentToken(token);
    if (!data) {
      res.status(404).json({ error: 'Fatura não encontrada ou link inválido' });
      return;
    }
    if (isPublicPayTelemetryEnabled()) {
      billingLog('invoice', 'public_pay_switch_method_request', {
        tenantId: data.tenant_id,
        method: parsed.data.payment_method,
      });
    }
    const result = await switchPaymentMethodByToken(
      token,
      parsed.data.payment_method,
      parsed.data.idempotency_key ?? null
    );
    const payloadMeta = buildPublicPayPayloadMeta(result.payment_urls);
    if (isPublicPayTelemetryEnabled()) {
      billingLog('invoice', 'public_pay_switch_method_success', {
        tenantId: data.tenant_id,
        method: parsed.data.payment_method,
        has_payment_payload: payloadMeta.has_payment_payload,
      });
    }
    res.json({
      ...result,
      ...payloadMeta,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao trocar método de pagamento';
    if (msg.includes('não encontrada') || msg.includes('inválido')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg.includes('não permitido') ||
      msg.includes('requer dados do cliente') ||
      msg.includes('já está paga') ||
      msg.includes('pagável') ||
      msg.includes('indisponível')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('postSwitchPaymentMethodByToken:', err);
    res.status(500).json({ error: msg });
  }
}

export async function postPayWithCardByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({ ok: false, error: 'Token é obrigatório', code: 'validation_error' });
      return;
    }
    const parsed = payWithCardBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'Verifique os dados do cartão e do titular.',
        code: 'validation_error',
      });
      return;
    }
    const remoteIp = getClientIpForPublicPay(req);
    const result = await payInvoiceWithCardByToken(token, parsed.data, remoteIp);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof PayWithCardError) {
      res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code });
      return;
    }
    console.error('postPayWithCardByToken:', err instanceof Error ? err.message : err);
    res.status(500).json({
      ok: false,
      error: 'Não foi possível processar o pagamento. Tente novamente.',
      code: 'gateway_error',
    });
  }
}

export async function postCompletePayByToken(req: Request, res: Response): Promise<void> {
  try {
    const token = req.params.token;
    if (!token) {
      res.status(400).json({ error: 'Token é obrigatório' });
      return;
    }
    const parsed = completeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const result = await completePaymentByToken(token, {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      cpf_cnpj: body.cpf_cnpj || null,
      company: body.company || null,
    });
    const payloadMeta = buildPublicPayPayloadMeta(result.payment_urls);
    if (isPublicPayTelemetryEnabled()) {
      billingLog('invoice', 'public_pay_complete', {
        has_payment_payload: payloadMeta.has_payment_payload,
        payment_options_summary: payloadMeta.payment_options_summary,
      });
    }
    res.json({ ...result, ...payloadMeta });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao completar pagamento';
    if (msg.includes('não encontrada') || msg.includes('inválido')) {
      res.status(404).json({ error: msg });
      return;
    }
    if (
      msg.includes('já possui') ||
      msg.includes('pendente') ||
      msg.includes('CPF/CNPJ é obrigatório') ||
      msg.includes('CPF/CNPJ inválido') ||
      msg.includes('Nome é obrigatório')
    ) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('postCompletePayByToken:', err);
    res.status(500).json({ error: msg });
  }
}
