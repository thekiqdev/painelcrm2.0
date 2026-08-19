/**
 * APIs públicas mínimas para /saas-pay/:token — mesma tenant_billing, sem UUID na URL.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  ensureTenantBillingPublicPayToken,
  getInvoiceByPlatformPublicPayToken,
  ensureTenantBillingInlinePayToken,
} from '../services/invoiceService.js';
import { pool } from '../utils/db.js';
import { pickGatewayFallbackUrlFromBilling } from '../services/saasBillingLinkHelpers.js';
import { buildPlatformSaasInvoiceUrl } from '../utils/saasPlatformInvoiceUrl.js';
import {
  getSaasBillingCheckoutPresentation,
  prepareSaasCheckoutPaymentMethodForBilling,
} from '../services/subscriptionService.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { syncAndGetTenantBillingStatusJson } from '../services/tenantBillingStatusSyncService.js';
import { payTenantBillingWithCard, PayWithCardError } from '../services/customerBillingService.js';
import { isValidCpfOrCnpj, onlyDigits } from '../utils/cpfCnpj.js';
import { yyyyMmDdFromDbDateValue } from '../utils/calendarDateBr.js';
import { ASAAS_CPF_CNPJ_USER_MESSAGE } from '../services/subscriptionService.js';
import { resolveTransactionalBrandName } from '../partner/partnerBrandResolver.js';

function billingReasonLabel(reason: string): string {
  switch (reason) {
    case 'seat_addon':
      return 'Assentos adicionais';
    case 'instance_addon':
      return 'Conexões WhatsApp adicionais';
    case 'plan_upgrade':
      return 'Upgrade de plano';
    case 'plan_renewal':
      return 'Renovação';
    case 'manual_charge':
      return 'Cobrança manual';
    case 'plan_purchase':
    default:
      return 'Plano / contratação';
  }
}

function billingIntervalLabel(interval: string | null | undefined): string {
  switch (String(interval || '').trim()) {
    case 'monthly':
      return 'Assinatura mensal';
    case 'quarterly':
      return 'Assinatura trimestral';
    case 'semi_annual':
      return 'Assinatura semestral';
    case 'yearly':
      return 'Assinatura anual';
    default:
      return '';
  }
}

function ymdOnly(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function resolveToken(req: Request): string | null {
  const t = (req.params as { token?: string }).token?.trim();
  return t || null;
}

export async function getPublicSaasBillingSummary(req: Request, res: Response): Promise<void> {
  const token = resolveToken(req);
  if (!token) {
    res.status(400).json({ ok: false, error: 'Token inválido', code: 'invalid_token' });
    return;
  }
  try {
    let row = await getInvoiceByPlatformPublicPayToken(token);
    if (!row) {
      res.status(404).json({ ok: false, error: 'Cobrança não encontrada', code: 'not_found' });
      return;
    }
    await ensureTenantBillingPublicPayToken(row.id).catch(() => {});
    row = (await getInvoiceByPlatformPublicPayToken(token)) ?? row;

    const tenantR = await pool.query<{ cpf_cnpj: string | null; name: string | null }>(
      `SELECT cpf_cnpj, name FROM tenants WHERE id = $1`,
      [row.tenant_id],
    );
    const docDigits = onlyDigits(tenantR.rows[0]?.cpf_cnpj ?? '');
    const tenant_has_valid_cpf = isValidCpfOrCnpj(docDigits);

    const planLabel =
      row.plan_name_snapshot?.trim() ||
      (
        await pool.query<{ name: string }>(`SELECT name FROM plans WHERE id = $1 LIMIT 1`, [row.plan_id])
      ).rows[0]?.name ||
      '';

    const presentation = await getSaasBillingCheckoutPresentation(row.tenant_id, row.id);
    const gatewayFallback = pickGatewayFallbackUrlFromBilling(row);
    const payTok = row.platform_public_pay_token?.trim();
    const platform_invoice_url = payTok ? buildPlatformSaasInvoiceUrl(payTok) : '';

    const openStatuses = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);
    const can_pay = openStatuses.has(row.status);

    const billingIntervalKey = row.billing_interval?.trim() || '';
    const billing_interval_label = billingIntervalLabel(billingIntervalKey);
    const period_start = ymdOnly(row.period_start);
    const period_end = ymdOnly(row.period_end);
    const tenant_display_name = (tenantR.rows[0]?.name ?? '').trim() || null;
    const platform_support_url = process.env.PLATFORM_SUPPORT_URL?.trim() || null;

    let saved_card: { brand: string | null; last4: string | null; gateway: string | null } | null =
      null;
    try {
      const {
        getActiveSaasCardTokenBySubscriptionId,
        getActiveSaasCardTokenByTenantId,
        toPublicSavedCard,
      } = await import('../services/billing2/billingCardTokenStore.js');
      const tok = row.subscription_id
        ? await getActiveSaasCardTokenBySubscriptionId(row.subscription_id)
        : await getActiveSaasCardTokenByTenantId(row.tenant_id);
      saved_card = toPublicSavedCard(tok);
    } catch {
      saved_card = null;
    }

    let pix_automatic: {
      available: boolean;
      status: string | null;
      has_active: boolean;
      switch_on: boolean;
      user_opted_off: boolean;
      qr_payload: string | null;
      qr_image: string | null;
    } | null = null;
    try {
      const { isBilling2FlagEnabled } = await import('../services/billing2/billingFeatureFlags.js');
      const available = await isBilling2FlagEnabled('pix_automatic');
      const {
        getPixAutomaticAuthBySubscriptionId,
        getPixAutomaticAuthByTenantId,
        toPublicPixAutomaticStatus,
      } = await import('../services/billing2/billingPixAutomaticStore.js');
      const auth = row.subscription_id
        ? await getPixAutomaticAuthBySubscriptionId(row.subscription_id)
        : await getPixAutomaticAuthByTenantId(row.tenant_id);
      const pub = toPublicPixAutomaticStatus(auth);
      const meta =
        row.gateway_metadata && typeof row.gateway_metadata === 'object'
          ? (row.gateway_metadata as Record<string, unknown>)
          : {};
      const status = pub?.status ?? null;
      const has_active = pub?.has_active ?? false;
      const user_opted_off =
        status === 'cancelled' ||
        status === 'cleared' ||
        status === 'refused' ||
        status === 'expired';
      pix_automatic = {
        available,
        status,
        has_active,
        switch_on: !user_opted_off && (has_active || status === 'pending'),
        user_opted_off,
        qr_payload:
          pub?.qr_payload ??
          (typeof meta.pix_copy_paste === 'string' ? meta.pix_copy_paste : null),
        qr_image:
          pub?.qr_image ?? (typeof meta.pix_qr_code === 'string' ? meta.pix_qr_code : null),
      };
    } catch {
      pix_automatic = null;
    }

    const pixFromAuth =
      pix_automatic?.status === 'pending'
        ? {
            pix_qr_code: pix_automatic.qr_image ?? presentation?.pix_qr_code ?? null,
            pix_copy_paste: pix_automatic.qr_payload ?? presentation?.pix_copy_paste ?? null,
          }
        : {
            pix_qr_code: presentation?.pix_qr_code ?? null,
            pix_copy_paste: presentation?.pix_copy_paste ?? null,
          };

    res.json({
      ok: true,
      platform_name: await resolveTransactionalBrandName({
        tenantId: row.tenant_id,
        host: req.get('x-forwarded-host') || req.get('host'),
      }),
      platform_invoice_url,
      platform_support_url,
      gateway_fallback_url: gatewayFallback || null,
      invoice_number: row.invoice_number,
      status: row.status,
      amount_cents: row.amount_cents,
      due_date: yyyyMmDdFromDbDateValue(row.due_date as string | Date | null) || '',
      plan_label: planLabel,
      billing_reason: row.billing_reason ?? 'plan_purchase',
      billing_reason_label: billingReasonLabel(row.billing_reason ?? 'plan_purchase'),
      billing_interval: billingIntervalKey || null,
      billing_interval_label: billing_interval_label || null,
      period_start,
      period_end,
      users_count: row.users_count ?? null,
      tenant_display_name,
      can_pay,
      tenant_has_valid_cpf,
      payment_method: presentation?.payment_method ?? row.payment_method ?? null,
      invoice_url: presentation?.invoice_url ?? null,
      bank_slip_url: presentation?.bank_slip_url ?? null,
      bank_slip_digitable_line: presentation?.bank_slip_digitable_line ?? null,
      pix_qr_code: pixFromAuth.pix_qr_code,
      pix_copy_paste: pixFromAuth.pix_copy_paste,
      /** Sprint 9 — cartão salvo (só máscara; sem token) */
      saved_card,
      /** Sprint 10 — Pix Automático */
      pix_automatic,
    });
  } catch (e) {
    console.error('[publicSaasBilling summary]', e);
    res.status(500).json({ ok: false, error: 'Erro ao carregar cobrança', code: 'server_error' });
  }
}

const prepareBodySchema = z.object({
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
});

export async function postPublicSaasBillingPreparePayment(req: Request, res: Response): Promise<void> {
  const token = resolveToken(req);
  if (!token) {
    res.status(400).json({ ok: false, error: 'Token inválido', code: 'invalid_token' });
    return;
  }
  const parsed = prepareBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Dados inválidos', code: 'validation_error' });
    return;
  }
  try {
    const row = await getInvoiceByPlatformPublicPayToken(token);
    if (!row) {
      res.status(404).json({ ok: false, error: 'Cobrança não encontrada', code: 'not_found' });
      return;
    }
    const pending = await prepareSaasCheckoutPaymentMethodForBilling(
      row.tenant_id,
      row.id,
      parsed.data.payment_method as PaymentMethod,
    );
    if (!pending) {
      res.status(400).json({
        ok: false,
        error:
          'Não foi possível preparar o pagamento. Verifique se a cobrança está aberta e se o ambiente suporta tentativas de pagamento.',
        code: 'prepare_failed',
      });
      return;
    }
    const response: Record<string, unknown> = {
      billing_id: pending.billing_id,
      invoice_number: pending.invoice_number,
      amount_cents: pending.amount_cents,
      status: pending.status,
      tenant_id: pending.tenant_id,
      payment_method: pending.payment_method,
    };
    if (pending.billing_reason) response.billing_reason = pending.billing_reason;
    if (pending.seat_addon_additional_seats != null) {
      response.seat_addon_additional_seats = pending.seat_addon_additional_seats;
    }
    if (pending.instance_addon_additional_instances != null) {
      response.instance_addon_additional_instances = pending.instance_addon_additional_instances;
    }
    if (pending.invoice_url) response.invoice_url = pending.invoice_url;
    if (pending.bank_slip_url) response.bank_slip_url = pending.bank_slip_url;
    if (pending.bank_slip_digitable_line) response.bank_slip_digitable_line = pending.bank_slip_digitable_line;
    if (pending.pix_qr_code) response.pix_qr_code = pending.pix_qr_code;
    if (pending.pix_copy_paste) response.pix_copy_paste = pending.pix_copy_paste;
    try {
      response.inline_pay_token = await ensureTenantBillingInlinePayToken(pending.billing_id);
    } catch {
      /* ignore */
    }
    res.status(200).json(response);
  } catch (e) {
    if (e instanceof Error && e.message === ASAAS_CPF_CNPJ_USER_MESSAGE) {
      res.status(400).json({ ok: false, error: e.message, code: 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD' });
      return;
    }
    console.error('[publicSaasBilling prepare]', e);
    res.status(500).json({ ok: false, error: 'Erro ao preparar pagamento', code: 'server_error' });
  }
}

export async function getPublicSaasBillingStatus(req: Request, res: Response): Promise<void> {
  const token = resolveToken(req);
  if (!token) {
    res.status(400).json({ ok: false, error: 'Token inválido', code: 'invalid_token' });
    return;
  }
  try {
    const row = await getInvoiceByPlatformPublicPayToken(token);
    if (!row) {
      res.status(404).json({ ok: false, error: 'Cobrança não encontrada', code: 'not_found' });
      return;
    }
    const payload = await syncAndGetTenantBillingStatusJson(row.id);
    if (!payload) {
      res.status(404).json({ ok: false, error: 'Cobrança não encontrada', code: 'not_found' });
      return;
    }
    res.json({ ok: true, ...payload });
  } catch (e) {
    console.error('[publicSaasBilling status]', e);
    res.status(500).json({ ok: false, error: 'Erro ao consultar status', code: 'server_error' });
  }
}

const payWithCardBodySchema = z
  .object({
    inline_pay_token: z.string().uuid(),
    idempotency_key: z.string().min(8).max(160),
    use_saved_card: z.boolean().optional(),
    credit_card: z
      .object({
        holder_name: z.string().min(2).max(120),
        number: z.string().min(13).max(22),
        expiry_month: z.string().regex(/^\d{1,2}$/),
        expiry_year: z.string().regex(/^\d{4}$/),
        cvv: z.string().min(3).max(4),
      })
      .optional(),
    cardholder: z
      .object({
        name: z.string().min(2).max(120),
        email: z.string().email().max(200),
        cpf_cnpj: z.string().min(11).max(18),
        postal_code: z.string().min(5).max(12),
        address_number: z.string().min(1).max(20),
        phone: z.string().min(8).max(20),
        address_complement: z.string().max(80).optional().nullable(),
        mobile_phone: z.string().max(20).optional().nullable(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.use_saved_card === true) return;
    if (!data.credit_card || !data.cardholder) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cartão obrigatório', path: ['credit_card'] });
    }
  });

export async function postPublicSaasBillingPayWithCard(req: Request, res: Response): Promise<void> {
  const token = resolveToken(req);
  if (!token) {
    res.status(400).json({ ok: false, error: 'Token inválido', code: 'invalid_token' });
    return;
  }
  const parsed = payWithCardBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Verifique os dados do cartão.', code: 'validation_error' });
    return;
  }
  try {
    const row = await getInvoiceByPlatformPublicPayToken(token);
    if (!row) {
      res.status(404).json({ ok: false, error: 'Cobrança não encontrada', code: 'not_found' });
      return;
    }
    const { inline_pay_token: _i, ...body } = parsed.data;
    const result = await payTenantBillingWithCard(row.id, {
      tenantId: null,
      inlinePayToken: parsed.data.inline_pay_token.trim(),
      body,
    });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof PayWithCardError) {
      res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code });
      return;
    }
    console.error('[publicSaasBilling payWithCard]', err);
    res.status(500).json({
      ok: false,
      error: 'Não foi possível processar o pagamento.',
      code: 'gateway_error',
    });
  }
}

/** Sprint 10 — inicia jornada Pix Automático (QR composto) para a fatura. */
export async function postPublicSaasBillingStartPixAutomatic(
  req: Request,
  res: Response
): Promise<void> {
  const token = resolveToken(req);
  if (!token) {
    res.status(400).json({ ok: false, error: 'Token inválido', code: 'invalid_token' });
    return;
  }
  try {
    const row = await getInvoiceByPlatformPublicPayToken(token);
    if (!row) {
      res.status(404).json({ ok: false, error: 'Cobrança não encontrada', code: 'not_found' });
      return;
    }
    const openStatuses = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);
    if (!openStatuses.has(row.status)) {
      res.status(400).json({ ok: false, error: 'Cobrança não está aberta', code: 'not_payable' });
      return;
    }
    const { startPixAutomaticAuthorizationForBilling } = await import(
      '../services/billing2/billingPixAutomaticService.js'
    );
    const result = await startPixAutomaticAuthorizationForBilling({
      billingId: row.id,
      correlationId: `saas_pay_pix_auto:${row.id}`,
    });
    if (!result.ok) {
      const status =
        result.detail === 'flag_pix_automatic_off'
          ? 403
          : result.detail === 'auth_already_active'
            ? 409
            : 400;
      res.status(status).json({ ok: false, error: result.detail, code: result.detail });
      return;
    }
    res.status(200).json({
      ok: true,
      authorization_id: result.authorization_id,
      status: result.status,
      pix_copy_paste: result.qr_payload,
      pix_qr_code: result.qr_image,
    });
  } catch (e) {
    console.error('[publicSaasBilling startPixAutomatic]', e);
    res.status(500).json({ ok: false, error: 'Erro ao iniciar Pix Automático', code: 'server_error' });
  }
}

/** Sprint C — switch OFF na fatura pública: cancela auth (não cancela payments do ciclo). */
export async function postPublicSaasBillingCancelPixAutomatic(
  req: Request,
  res: Response
): Promise<void> {
  const token = resolveToken(req);
  if (!token) {
    res.status(400).json({ ok: false, error: 'Token inválido', code: 'invalid_token' });
    return;
  }
  try {
    const row = await getInvoiceByPlatformPublicPayToken(token);
    if (!row) {
      res.status(404).json({ ok: false, error: 'Cobrança não encontrada', code: 'not_found' });
      return;
    }
    const { cancelPixAutomaticAuthorizationForSubscription } = await import(
      '../services/billing2/billingPixAutomaticService.js'
    );
    const result = await cancelPixAutomaticAuthorizationForSubscription({
      tenantId: row.tenant_id,
      subscriptionId: row.subscription_id,
      billingId: row.id,
      correlationId: `saas_pay_pix_auto_off:${row.id}`,
      reason: 'switch_off_public_pay',
    });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.detail, code: result.detail });
      return;
    }
    res.status(200).json({
      ok: true,
      detail: result.detail,
      pix_copy_paste: result.pix_copy_paste,
      pix_qr_code: result.pix_qr_code,
    });
  } catch (e) {
    console.error('[publicSaasBilling cancelPixAutomatic]', e);
    res.status(500).json({ ok: false, error: 'Erro ao desativar Pix Automático', code: 'server_error' });
  }
}
