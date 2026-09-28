/**
 * POST /api/plan-purchase — compra de plano (self-service).
 * Pode ser chamado logado (usa req.tenantId) ou não logado (cria tenant temporário com status payment_pending).
 * Fase 1: checkout anônimo com senha/WhatsApp opcionais no schema; obrigatórios quando informados juntos (fluxo novo).
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  subscribePlan,
  ASAAS_CPF_CNPJ_USER_MESSAGE,
  getPendingSaasPlanCheckoutPresentation,
  getSaasBillingCheckoutPresentation,
  prepareSaasCheckoutPaymentMethodForBilling,
} from '../services/subscriptionService.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { ensureTenantBillingInlinePayToken } from '../services/invoiceService.js';
import { createTenantAdminUser } from '../services/tenantAdminService.js';
import { isValidCpfOrCnpj, onlyDigits } from '../utils/cpfCnpj.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import {
  assertAdminEmailAvailableForCheckout,
  assertAdminWhatsappAvailableForCheckout,
  normalizeWhatsappDigits,
} from '../services/userIdentityValidationService.js';
import { isCheckoutTrialV1Enabled } from '../config/checkoutTrialFeatureFlags.js';
import {
  assertNewTrialSignupAllowed,
  TrialAlreadyConsumedError,
} from '../services/trialSignupGuardService.js';
import { generateToken } from '../utils/jwt.js';
import { comparePassword } from '../utils/bcrypt.js';
import { notifySuperAdminsNewTenant } from '../services/superadminNotificationsService.js';
import {
  schedulePublishPlatformAccountCreated,
  schedulePublishPlatformTrialStarted,
} from '../services/platformNotifications/platformBusinessNotifications.js';
import { effectiveCheckoutTrialDays } from '../utils/checkoutTrialPlan.js';
import { getMyTenantAndPrimary } from './myTenantPlanController.js';
import {
  marketingAttributionInputSchema,
  parseMarketingAttributionFromBody,
  persistTenantMarketingAttribution,
} from '../services/marketingAttributionService.js';

const validateCheckoutAdminBodySchema = z.object({
  email: z.string().email(),
  whatsapp: z.string().min(1),
});

const planPurchaseBodySchema = z.object({
  plan_id: z.string().uuid(),
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional().default('monthly'),
  users_count: z.number().int().min(1).optional().nullable(),
  tenant_id: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
  company_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  cpf_cnpj: z.string().optional(),
  phone: z.string().optional(),
  responsible_name: z.string().optional(),
  /** Fluxo checkout Fase 1 — opcional; obrigatório apenas no fluxo anônimo completo (com validação prévia). */
  password: z.string().min(6).optional(),
  /** WhatsApp do admin (normalizado no backend); alternativa legada: só `phone`. */
  whatsapp: z.string().optional(),
  marketing_attribution: marketingAttributionInputSchema.optional().nullable(),
});

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'empresa';
  return base;
}

function jsonError(
  res: Response,
  status: number,
  error: string,
  code: string,
  field?: string
): void {
  const body: Record<string, unknown> = { error, code };
  if (field) body.field = field;
  res.status(status).json(body);
}

function checkoutTenantIdentityMismatchError(): Error {
  const err = new Error(
    'Os dados informados não correspondem a esta conta. Confirme o e-mail e o documento ou faça login.'
  );
  (err as Error & { code?: string }).code = 'CHECKOUT_TENANT_IDENTITY_MISMATCH';
  return err;
}

/** Compara telefones já normalizados (somente dígitos), tolerando prefixo 55. */
function brazilPhoneDigitsComparable(a: string, b: string): boolean {
  const strip = (d: string) => {
    let x = d.replace(/\D/g, '');
    if (x.startsWith('55') && x.length > 11) x = x.slice(2);
    return x;
  };
  const sa = strip(a);
  const sb = strip(b);
  return sa === sb || sa.endsWith(sb) || sb.endsWith(sa);
}

/**
 * Quando o checkout anônimo reutiliza `body.tenant_id` (trial / payment_pending), exige coerência com o cadastro
 * existente para impedir reuso indevido de outro tenant em status permitido.
 */
async function assertBodyMatchesTenantForCheckoutReuse(
  body: z.infer<typeof planPurchaseBodySchema>,
  tenantId: string
): Promise<void> {
  const row = await pool.query<{
    billing_email: string | null;
    cpf_cnpj: string | null;
    billing_phone: string | null;
    primary_email: string | null;
  }>(
    `SELECT t.billing_email, t.cpf_cnpj, t.billing_phone,
            (SELECT u.email FROM users u WHERE u.tenant_id = t.id ORDER BY u.created_at ASC LIMIT 1) AS primary_email
     FROM tenants t WHERE t.id = $1`,
    [tenantId]
  );
  const t = row.rows[0];
  if (!t) return;

  const bodyEmailNorm = body.email?.trim() ? normalizeEmailForUniqueness(body.email.trim()) : null;
  const tenantEmailCandidates: string[] = [];
  if (t.billing_email?.trim()) tenantEmailCandidates.push(normalizeEmailForUniqueness(t.billing_email.trim()));
  if (t.primary_email?.trim()) tenantEmailCandidates.push(normalizeEmailForUniqueness(t.primary_email.trim()));
  const distinctTenantEmails = [...new Set(tenantEmailCandidates)];
  if (distinctTenantEmails.length > 0) {
    if (!bodyEmailNorm || !distinctTenantEmails.some((e) => e === bodyEmailNorm)) {
      throw checkoutTenantIdentityMismatchError();
    }
  }

  const tenantDoc = onlyDigits(t.cpf_cnpj ?? '');
  if (tenantDoc.length >= 11) {
    const bodyDoc = onlyDigits(body.cpf_cnpj ?? '');
    if (!bodyDoc || bodyDoc !== tenantDoc) {
      throw checkoutTenantIdentityMismatchError();
    }
  }

  const tenantPhoneDigits = (t.billing_phone ?? '').replace(/\D/g, '');
  if (tenantPhoneDigits.length >= 8) {
    const wa = normalizeWhatsappDigits(body.whatsapp ?? null);
    const phoneRaw = body.phone?.replace(/\D/g, '') ?? '';
    const bodyPhoneDigits = wa ?? (phoneRaw.length >= 8 ? phoneRaw : null);
    if (bodyPhoneDigits) {
      if (!brazilPhoneDigitsComparable(bodyPhoneDigits, tenantPhoneDigits)) {
        throw checkoutTenantIdentityMismatchError();
      }
    }
  }
}

/**
 * Resolve tenant: req.tenantId (logado), body.tenant_id (se existir) ou cria novo com status payment_pending.
 */
async function resolveTenantId(
  req: AuthRequest,
  body: z.infer<typeof planPurchaseBodySchema>,
  planId: string,
  usersCount: number | null,
  options: { fullCheckout: boolean; whatsappDigits: string | null }
): Promise<{ tenantId: string; isNewTenant: boolean }> {
  if (req.tenantId) {
    return { tenantId: req.tenantId, isNewTenant: false };
  }

  if (body.tenant_id) {
    const row = await pool.query(
      'SELECT id FROM tenants WHERE id = $1 AND status IN ($2, $3)',
      [body.tenant_id, 'trial', 'payment_pending']
    );
    if (row.rows.length > 0) {
      await assertBodyMatchesTenantForCheckoutReuse(body, body.tenant_id);
      return { tenantId: body.tenant_id, isNewTenant: false };
    }
  }

  const name = (body.company_name ?? body.name)?.trim();
  if (!name) {
    const err = new Error('INVALID_CHECKOUT_CONTEXT');
    (err as Error & { code?: string }).code = 'INVALID_CHECKOUT_CONTEXT';
    throw err;
  }

  const checkoutEmail = body.email?.trim();
  if (checkoutEmail) {
    const em = normalizeEmailForUniqueness(checkoutEmail);
    if (!options.fullCheckout) {
      const emailTaken = await pool.query('SELECT 1 FROM users WHERE lower(btrim(email)) = $1 LIMIT 1', [em]);
      if (emailTaken.rows.length > 0) {
        throw new Error('EMAIL_ALREADY_REGISTERED_USE_LOGIN');
      }
    }
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 0;
  for (;;) {
    const exists = await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (exists.rows.length === 0) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const billingPhone = options.whatsappDigits ?? body.phone?.replace(/\D/g, '') ?? null;

  const created = await pool.query<{ id: string }>(
    `INSERT INTO tenants (name, slug, plan_id, status, created_via, billing_email, billing_phone, cpf_cnpj, responsible_name)
     VALUES ($1, $2, $3, 'payment_pending', 'registration', $4, $5, $6, $7)
     RETURNING id`,
    [
      name,
      slug,
      planId,
      body.email?.trim() ?? null,
      billingPhone && billingPhone.length >= 8 ? billingPhone : body.phone?.trim() ?? null,
      body.cpf_cnpj?.replace(/\D/g, '') || null,
      body.responsible_name?.trim() ?? null,
    ]
  );
  const tenantId = created.rows[0].id;

  if (usersCount != null && usersCount > 0) {
    await pool.query(
      'UPDATE tenants SET max_users_override = $1, updated_at = now() WHERE id = $2',
      [usersCount, tenantId]
    );
  }

  const adminEmail = body.email?.trim();
  if (adminEmail) {
    try {
      await createTenantAdminUser({
        tenantId,
        tenantName: name,
        email: adminEmail,
        responsibleName: body.responsible_name?.trim(),
        password: body.password,
        whatsappDigits: options.whatsappDigits,
      });
      if (body.password) {
        await pool.query(`UPDATE tenants SET onboarding_completed = true, updated_at = now() WHERE id = $1`, [tenantId]);
      }
    } catch (err) {
      console.error('[plan-purchase] createTenantAdminUser', err);
      throw err;
    }
  }

  return { tenantId, isNewTenant: true };
}

export async function postPlanPurchase(req: AuthRequest, res: Response): Promise<void> {
  let body: z.infer<typeof planPurchaseBodySchema>;
  try {
    body = planPurchaseBodySchema.parse(req.body || {});
  } catch (e) {
    if (e instanceof z.ZodError) {
      const planIssue = e.errors.some((x) => x.path.join('.') === 'plan_id');
      if (planIssue) {
        jsonError(res, 400, 'Plano inválido ou ausente.', 'PLAN_REQUIRED');
        return;
      }
      res.status(400).json({ error: 'Validation error', details: e.errors, code: 'INVALID_CHECKOUT_CONTEXT' });
      return;
    }
    throw e;
  }

  const upgradeLogged = Boolean(req.tenantId);
  const usersCount = body.users_count ?? null;

  /** Fluxo checkout completo: anônimo, sem reutilizar tenant_id, com senha (novo contrato Fase 1). */
  let fullCheckout = false;
  let whatsappDigits: string | null = null;

  if (!upgradeLogged && !body.tenant_id) {
    const pwd = body.password?.trim();
    if (pwd && pwd.length >= 6) {
      fullCheckout = true;
      whatsappDigits = normalizeWhatsappDigits(body.whatsapp ?? body.phone ?? null);
      if (!body.company_name?.trim() && !body.name?.trim()) {
        jsonError(res, 400, 'Informe o nome da empresa.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }
      if (!body.email?.trim()) {
        jsonError(res, 400, 'Informe o e-mail.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }
      if (!body.responsible_name?.trim()) {
        jsonError(res, 400, 'Informe o nome do administrador.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }
      if (!whatsappDigits) {
        jsonError(res, 400, 'Informe um WhatsApp válido com DDD.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }
      try {
        await assertAdminEmailAvailableForCheckout(normalizeEmailForUniqueness(body.email!));
        await assertAdminWhatsappAvailableForCheckout(whatsappDigits);
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        const msg = err instanceof Error ? err.message : String(err);
        if (code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('EMAIL_ALREADY')) {
          jsonError(
            res,
            400,
            'Este e-mail já possui cadastro. Faça login ou use outro e-mail.',
            'EMAIL_ALREADY_REGISTERED_USE_LOGIN'
          );
          return;
        }
        if (code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('WHATSAPP_ALREADY')) {
          jsonError(
            res,
            400,
            'Este WhatsApp já possui cadastro. Faça login ou use outro número.',
            'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN'
          );
          return;
        }
        throw err;
      }
    }
  }

  try {
    const { tenantId, isNewTenant } = await resolveTenantId(req, body, body.plan_id, usersCount, {
      fullCheckout,
      whatsappDigits,
    });

    if (!isNewTenant) {
      const curTenant = await pool.query<{ status: string; trial_ends_at: string | null }>(
        'SELECT status, trial_ends_at FROM tenants WHERE id = $1',
        [tenantId]
      );
      const prev = curTenant.rows[0];
      const nowMs = Date.now();
      const trialWindowStillOpen =
        prev?.status === 'trial' &&
        (prev.trial_ends_at == null || new Date(prev.trial_ends_at).getTime() >= nowMs);
      let nextStatus: string;
      if (prev?.status === 'active') {
        nextStatus = 'active';
      } else if (trialWindowStillOpen) {
        nextStatus = 'trial';
      } else {
        nextStatus = 'payment_pending';
      }

      await pool.query(
        `UPDATE tenants
         SET plan_id = $1, status = $2::text,
             max_users_override = COALESCE($3, max_users_override),
             billing_email = COALESCE($5, billing_email),
             billing_phone = COALESCE($6, billing_phone),
             cpf_cnpj = COALESCE($7, cpf_cnpj),
             responsible_name = COALESCE($8, responsible_name),
             suspension_reason = NULL,
             suspended_at = NULL,
             updated_at = now()
         WHERE id = $4`,
        [
          body.plan_id,
          nextStatus,
          usersCount,
          tenantId,
          body.email?.trim() ?? null,
          body.phone?.trim() ?? null,
          body.cpf_cnpj?.replace(/\D/g, '') || null,
          body.responsible_name?.trim() ?? null,
        ]
      );
    }

    const paymentMethod = body.payment_method ?? 'BOLETO';
    if (paymentMethod === 'PIX') {
      const row = await pool.query<{ cpf_cnpj: string | null }>(
        'SELECT cpf_cnpj FROM tenants WHERE id = $1',
        [tenantId]
      );
      const digits = onlyDigits(row.rows[0]?.cpf_cnpj ?? '');
      if (!isValidCpfOrCnpj(digits)) {
        jsonError(
          res,
          400,
          'CPF/CNPJ é obrigatório e deve ser válido para pagamento PIX.',
          'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD',
          'cpf_cnpj'
        );
        return;
      }
    }

    const result = await subscribePlan(tenantId, body.plan_id, body.billing_interval, {
      usersCount,
      source: 'self_service',
      billingReason: 'plan_purchase',
      paymentMethod: body.payment_method ?? 'BOLETO',
    });

    const b = result.billing;
    const response: Record<string, unknown> = {
      billing_id: b.id,
      invoice_number: b.invoice_number,
      amount_cents: b.amount_cents,
      status: b.status,
      tenant_id: tenantId,
      payment_method: b.payment_method ?? undefined,
    };
    if (result.paymentUrls?.invoiceUrl) response.invoice_url = result.paymentUrls.invoiceUrl;
    if (result.paymentUrls?.bankSlipUrl) response.bank_slip_url = result.paymentUrls.bankSlipUrl;
    if (result.paymentUrls?.bankSlipDigitableLine)
      response.bank_slip_digitable_line = result.paymentUrls.bankSlipDigitableLine;
    if (result.paymentUrls?.pixQrCode) response.pix_qr_code = result.paymentUrls.pixQrCode;
    if (result.paymentUrls?.pixCopyPaste) response.pix_copy_paste = result.paymentUrls.pixCopyPaste;
    try {
      response.inline_pay_token = await ensureTenantBillingInlinePayToken(b.id);
    } catch (e) {
      console.warn('[plan-purchase] ensureTenantBillingInlinePayToken', e);
    }
    if (isNewTenant) {
      const u = await pool.query('SELECT 1 FROM users WHERE tenant_id = $1 LIMIT 1', [tenantId]);
      if (u.rows.length > 0) {
        schedulePublishPlatformAccountCreated(tenantId);
      }
    }
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors, code: 'INVALID_CHECKOUT_CONTEXT' });
      return;
    }
    const message = error instanceof Error ? error.message : 'Erro ao processar compra';
    const errCode = (error as Error & { code?: string }).code;

    if (message === ASAAS_CPF_CNPJ_USER_MESSAGE) {
      jsonError(res, 400, message, 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD', 'cpf_cnpj');
      return;
    }
    if (message.includes('Asaas API') && /cpf|cnpj|documento/i.test(message)) {
      jsonError(res, 400, ASAAS_CPF_CNPJ_USER_MESSAGE, 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD', 'cpf_cnpj');
      return;
    }
    if (
      message === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' ||
      errCode === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' ||
      message === 'EMAIL_ALREADY_REGISTERED_OTHER_TENANT' ||
      errCode === 'EMAIL_GLOBAL_DUPLICATE'
    ) {
      jsonError(
        res,
        400,
        'Este e-mail já possui cadastro. Faça login ou use outro e-mail.',
        'EMAIL_ALREADY_REGISTERED_USE_LOGIN'
      );
      return;
    }
    if (message === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN' || errCode === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN') {
      jsonError(
        res,
        400,
        'Este WhatsApp já possui cadastro. Faça login ou use outro número.',
        'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN'
      );
      return;
    }
    if (message === 'INVALID_CHECKOUT_CONTEXT' || errCode === 'INVALID_CHECKOUT_CONTEXT') {
      jsonError(
        res,
        400,
        'Dados insuficientes ou inválidos para concluir o checkout.',
        'INVALID_CHECKOUT_CONTEXT'
      );
      return;
    }
    if (errCode === 'CHECKOUT_TENANT_IDENTITY_MISMATCH') {
      jsonError(
        res,
        400,
        'Os dados informados não correspondem a esta conta. Confirme o e-mail e o documento ou faça login.',
        'CHECKOUT_TENANT_IDENTITY_MISMATCH'
      );
      return;
    }
    if (message.includes('não encontrado') || message.includes('inativo') || message.includes('exigem')) {
      res.status(400).json({ error: message, code: 'INVALID_CHECKOUT_CONTEXT' });
      return;
    }
    console.error('postPlanPurchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const planCheckoutPendingQuerySchema = z.object({
  billing_interval: z.enum(['monthly', 'quarterly', 'semi_annual', 'yearly']).optional().default('monthly'),
  users_count: z.coerce.number().int().min(1).optional(),
  /** Hub /meu-plano: reapresentar uma cobrança pai específica (tenant_billing), sem listar tentativas. */
  billing_id: z.string().uuid().optional(),
});

/** GET /api/me/tenant/plan-checkout-pending — reapresenta cobrança SaaS já gerada (URLs em gateway_metadata), sem novo POST. */
export async function getPlanCheckoutPending(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa obrigatória', code: 'TENANT_REQUIRED' });
      return;
    }
    const parsed = planCheckoutPendingQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Parâmetros inválidos', code: 'INVALID_QUERY' });
      return;
    }
    const { billing_interval, users_count, billing_id } = parsed.data;
    if (billing_id) {
      const ctx = await getMyTenantAndPrimary(req);
      if (!ctx || ctx.primaryUserId !== req.userId) {
        res.status(403).json({
          error: 'Apenas o administrador principal da conta pode acessar o pagamento desta cobrança.',
          code: 'PLAN_COMMERCE_PRIMARY_ONLY',
        });
        return;
      }
      const pending = await getSaasBillingCheckoutPresentation(tenantId, billing_id);
      res.json({ pending });
      return;
    }
    const pending = await getPendingSaasPlanCheckoutPresentation(tenantId, billing_interval, users_count ?? null);
    res.json({ pending });
  } catch (e) {
    console.error('getPlanCheckoutPending', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const planCheckoutPrepareBodySchema = z.object({
  billing_id: z.string().uuid(),
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
});

/**
 * POST /api/me/tenant/plan-checkout-prepare-payment — troca/prepara método em fatura SaaS existente
 * (ex.: seat_addon) sem recalcular valor pelo plano.
 */
export async function postPlanCheckoutPreparePayment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: 'Empresa obrigatória', code: 'TENANT_REQUIRED' });
      return;
    }
    const ctx = await getMyTenantAndPrimary(req);
    if (!ctx || ctx.primaryUserId !== req.userId) {
      res.status(403).json({
        error: 'Apenas o administrador principal da conta pode preparar ou alterar o pagamento desta cobrança.',
        code: 'PLAN_COMMERCE_PRIMARY_ONLY',
      });
      return;
    }
    const body = planCheckoutPrepareBodySchema.parse(req.body || {});
    const pending = await prepareSaasCheckoutPaymentMethodForBilling(
      tenantId,
      body.billing_id,
      body.payment_method as PaymentMethod
    );
    if (!pending) {
      jsonError(
        res,
        400,
        'Não foi possível preparar o pagamento para esta cobrança. Atualize a página ou tente outro método.',
        'CHECKOUT_PREPARE_PAYMENT_FAILED'
      );
      return;
    }
    const response: Record<string, unknown> = {
      billing_id: pending.billing_id,
      invoice_number: pending.invoice_number,
      amount_cents: pending.amount_cents,
      status: pending.status,
      tenant_id: tenantId,
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
    } catch (e) {
      console.warn('[plan-checkout-prepare-payment] ensureTenantBillingInlinePayToken', e);
    }
    res.status(200).json(response);
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: e.errors, code: 'INVALID_CHECKOUT_CONTEXT' });
      return;
    }
    if (e instanceof Error && e.message === ASAAS_CPF_CNPJ_USER_MESSAGE) {
      jsonError(res, 400, e.message, 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD', 'cpf_cnpj');
      return;
    }
    console.error('postPlanCheckoutPreparePayment', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/plan-purchase/complete-signup-trial — conclui cadastro com trial (sem subscribePlan).
 * Protegido por CHECKOUT_TRIAL_V1. Não gera cobrança; login imediato via JWT na resposta.
 * Com `tenant_id` (após plan-purchase / “Concluir depois”): converte `payment_pending` → `trial`,
 * cancela faturas SaaS abertas e emite JWT.
 */
export async function postCompleteSignupTrial(req: AuthRequest, res: Response): Promise<void> {
  if (!isCheckoutTrialV1Enabled()) {
    jsonError(
      res,
      403,
      'Trial no checkout está desligado no servidor. Defina CHECKOUT_TRIAL_V1=true no .env da API e reinicie.',
      'CHECKOUT_TRIAL_V1_DISABLED'
    );
    return;
  }
  if (req.tenantId) {
    jsonError(
      res,
      400,
      'Sessão já autenticada. Use o pagamento no checkout logado.',
      'ALREADY_AUTHENTICATED'
    );
    return;
  }

  let body: z.infer<typeof planPurchaseBodySchema>;
  try {
    body = planPurchaseBodySchema.parse(req.body || {});
  } catch (e) {
    if (e instanceof z.ZodError) {
      const planIssue = e.errors.some((x) => x.path.join('.') === 'plan_id');
      if (planIssue) {
        jsonError(res, 400, 'Plano inválido ou ausente.', 'PLAN_REQUIRED');
        return;
      }
      res.status(400).json({ error: 'Validation error', details: e.errors, code: 'INVALID_CHECKOUT_CONTEXT' });
      return;
    }
    throw e;
  }

  const pwd = body.password?.trim();
  if (!pwd || pwd.length < 6) {
    jsonError(res, 400, 'Informe uma senha com ao menos 6 caracteres.', 'INVALID_CHECKOUT_CONTEXT');
    return;
  }
  const whatsappDigits = normalizeWhatsappDigits(body.whatsapp ?? body.phone ?? null);
  if (!body.company_name?.trim() && !body.name?.trim()) {
    jsonError(res, 400, 'Informe o nome da empresa.', 'INVALID_CHECKOUT_CONTEXT');
    return;
  }
  if (!body.email?.trim()) {
    jsonError(res, 400, 'Informe o e-mail.', 'INVALID_CHECKOUT_CONTEXT');
    return;
  }
  if (!body.responsible_name?.trim()) {
    jsonError(res, 400, 'Informe o nome do administrador.', 'INVALID_CHECKOUT_CONTEXT');
    return;
  }
  if (!whatsappDigits) {
    jsonError(res, 400, 'Informe um WhatsApp válido com DDD.', 'INVALID_CHECKOUT_CONTEXT');
    return;
  }

  const usersCount = body.users_count ?? null;
  const emailNorm = normalizeEmailForUniqueness(body.email!);

  /** Reuso: “Concluir depois” após plan-purchase — tenant payment_pending → trial + JWT. */
  if (body.tenant_id) {
    try {
      const planMetaRow = await pool.query<{
        trial_days: number | null;
        is_free: boolean | null;
        plan_type: string | null;
        free_access_days: number | null;
      }>(
        `SELECT trial_days, is_free, plan_type, free_access_days FROM plans WHERE id = $1 AND is_active = true`,
        [body.plan_id]
      );
      if (planMetaRow.rows.length === 0) {
        jsonError(res, 400, 'Plano não encontrado ou inativo.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }
      const reuseTrialDays = effectiveCheckoutTrialDays(planMetaRow.rows[0]);
      if (reuseTrialDays < 1) {
        jsonError(res, 400, 'Este plano não oferece período de trial no checkout.', 'PLAN_HAS_NO_TRIAL');
        return;
      }

      const tenantRow = await pool.query<{
        id: string;
        status: string;
        plan_id: string;
        has_used_trial: boolean | null;
        trial_ends_at: string | null;
      }>(
        `SELECT id, status, plan_id, has_used_trial, trial_ends_at
         FROM tenants WHERE id = $1`,
        [body.tenant_id]
      );
      const tenant = tenantRow.rows[0];
      if (!tenant) {
        jsonError(res, 400, 'Conta de checkout não encontrada.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }
      if (tenant.plan_id !== body.plan_id) {
        jsonError(res, 400, 'Plano não corresponde a esta conta.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }

      const admin = await pool.query<{
        id: string;
        email: string;
        password_hash: string | null;
      }>(
        `SELECT id, email, password_hash
         FROM users
         WHERE tenant_id = $1
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenant.id]
      );
      const user = admin.rows[0];
      if (!user?.password_hash) {
        jsonError(res, 400, 'Conta sem senha. Refaça o checkout ou use login.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }
      if (normalizeEmailForUniqueness(user.email) !== emailNorm) {
        jsonError(
          res,
          400,
          'Os dados informados não correspondem a esta conta. Confirme o e-mail ou faça login.',
          'CHECKOUT_TENANT_IDENTITY_MISMATCH'
        );
        return;
      }
      const pwdOk = await comparePassword(pwd, user.password_hash);
      if (!pwdOk) {
        jsonError(res, 401, 'Senha incorreta.', 'INVALID_CHECKOUT_CONTEXT');
        return;
      }

      const nowMs = Date.now();
      const trialStillOpen =
        tenant.status === 'trial' &&
        (tenant.trial_ends_at == null || new Date(tenant.trial_ends_at).getTime() >= nowMs);

      if (trialStillOpen) {
        const token = generateToken({ userId: user.id, email: user.email });
        res.status(200).json({
          token,
          tenant_id: tenant.id,
          user: {
            id: user.id,
            email: user.email,
            tenant_id: tenant.id,
            registration_complete: true,
          },
        });
        return;
      }

      if (tenant.status !== 'payment_pending') {
        jsonError(
          res,
          400,
          'Esta conta não pode iniciar trial neste estado. Faça login ou conclua o pagamento.',
          'INVALID_CHECKOUT_CONTEXT'
        );
        return;
      }

      if (tenant.has_used_trial) {
        jsonError(
          res,
          409,
          'Trial já utilizado para estes dados. Faça login ou conclua o pagamento na retomada.',
          'TRIAL_ALREADY_CONSUMED'
        );
        return;
      }

      const reuseClient = await pool.connect();
      try {
        await reuseClient.query('BEGIN');
        await reuseClient.query(
          `UPDATE tenant_billing
           SET status = 'cancelled', updated_at = now()
           WHERE tenant_id = $1
             AND status = ANY($2::text[])
             AND COALESCE(billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade')`,
          [tenant.id, ['pending', 'waiting_payment', 'processing', 'overdue']]
        );
        await reuseClient.query(
          `UPDATE tenants
           SET status = 'trial',
               trial_ends_at = now() + ($1::int * interval '1 day'),
               has_used_trial = true,
               trial_consumed_at = now(),
               onboarding_completed = true,
               suspension_reason = NULL,
               suspended_at = NULL,
               updated_at = now()
           WHERE id = $2`,
          [reuseTrialDays, tenant.id]
        );
        await reuseClient.query('COMMIT');
      } catch (e) {
        try {
          await reuseClient.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        reuseClient.release();
      }

      schedulePublishPlatformTrialStarted(tenant.id);
      const token = generateToken({ userId: user.id, email: user.email });
      res.status(201).json({
        token,
        tenant_id: tenant.id,
        user: {
          id: user.id,
          email: user.email,
          tenant_id: tenant.id,
          registration_complete: true,
        },
      });
      return;
    } catch (err) {
      console.error('postCompleteSignupTrial reuse payment_pending error:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }
  }

  try {
    await assertAdminEmailAvailableForCheckout(emailNorm);
    await assertAdminWhatsappAvailableForCheckout(whatsappDigits);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('EMAIL_ALREADY')) {
      jsonError(
        res,
        400,
        'Este e-mail já possui cadastro. Faça login ou use outro e-mail.',
        'EMAIL_ALREADY_REGISTERED_USE_LOGIN'
      );
      return;
    }
    if (code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('WHATSAPP_ALREADY')) {
      jsonError(
        res,
        400,
        'Este WhatsApp já possui cadastro. Faça login ou use outro número.',
        'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN'
      );
      return;
    }
    throw err;
  }

  const planRow = await pool.query<{
    trial_days: number | null;
    is_free: boolean;
    plan_type: string;
    free_access_days: number | null;
  }>(
    `SELECT trial_days, is_free, plan_type, free_access_days FROM plans WHERE id = $1 AND is_active = true`,
    [body.plan_id]
  );
  if (planRow.rows.length === 0) {
    jsonError(res, 400, 'Plano não encontrado ou inativo.', 'INVALID_CHECKOUT_CONTEXT');
    return;
  }
  const planMeta = planRow.rows[0];
  const trialDays = effectiveCheckoutTrialDays(planMeta);
  if (trialDays < 1) {
    jsonError(res, 400, 'Este plano não oferece período de trial no checkout.', 'PLAN_HAS_NO_TRIAL');
    return;
  }
  if (planMeta.plan_type === 'custom') {
    if (usersCount == null || usersCount < 1) {
      jsonError(res, 400, 'Planos personalizados exigem quantidade de usuários.', 'INVALID_CHECKOUT_CONTEXT');
      return;
    }
  }

  const name = (body.company_name ?? body.name)!.trim();
  const cpfDigits = body.cpf_cnpj?.replace(/\D/g, '') || null;

  try {
    await assertNewTrialSignupAllowed({
      cpfCnpjDigits: cpfDigits,
      emailNormalized: normalizeEmailForUniqueness(body.email!),
      whatsappDigits,
    });
  } catch (err) {
    if (err instanceof TrialAlreadyConsumedError) {
      jsonError(res, 409, err.message, 'TRIAL_ALREADY_CONSUMED');
      return;
    }
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const baseSlug = slugify(name);
    let slug = baseSlug;
    let suffix = 0;
    for (;;) {
      const exists = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
      if (exists.rows.length === 0) break;
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const billingPhone = whatsappDigits ?? body.phone?.replace(/\D/g, '') ?? null;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, plan_id, status, created_via, billing_email, billing_phone, cpf_cnpj, responsible_name, trial_ends_at, has_used_trial, trial_consumed_at, onboarding_completed)
       VALUES ($1, $2, $3, 'trial', 'registration', $4, $5, $6, $7, now() + ($8::int * interval '1 day'), true, now(), true)
       RETURNING id`,
      [
        name,
        slug,
        body.plan_id,
        body.email?.trim() ?? null,
        billingPhone && billingPhone.length >= 8 ? billingPhone : body.phone?.trim() ?? null,
        cpfDigits,
        body.responsible_name?.trim() ?? null,
        trialDays,
      ]
    );
    const tenantId = inserted.rows[0].id;

    if (usersCount != null && usersCount > 0) {
      await client.query(
        'UPDATE tenants SET max_users_override = $1, updated_at = now() WHERE id = $2',
        [usersCount, tenantId]
      );
    }

    const { userId, email } = await createTenantAdminUser(
      {
        tenantId,
        tenantName: name,
        email: body.email!.trim(),
        responsibleName: body.responsible_name?.trim(),
        password: pwd,
        whatsappDigits,
      },
      { db: client }
    );

    await persistTenantMarketingAttribution(client, {
      tenantId,
      userId,
      attribution: parseMarketingAttributionFromBody({ marketing_attribution: body.marketing_attribution }),
    });

    await client.query('COMMIT');

    setImmediate(() => notifySuperAdminsNewTenant(name, tenantId).catch(() => {}));
    schedulePublishPlatformAccountCreated(tenantId);
    schedulePublishPlatformTrialStarted(tenantId);

    const token = generateToken({ userId, email });

    res.status(201).json({
      token,
      tenant_id: tenantId,
      user: {
        id: userId,
        email,
        tenant_id: tenantId,
        registration_complete: true,
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('postCompleteSignupTrial error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * POST /api/plan-purchase/validate-admin — pré-validação de e-mail/WhatsApp do admin (mesmas regras do checkout anônimo).
 * Não altera dados; não substitui POST /api/plan-purchase.
 */
export async function postValidateCheckoutAdmin(req: Request, res: Response): Promise<void> {
  let body: z.infer<typeof validateCheckoutAdminBodySchema>;
  try {
    body = validateCheckoutAdminBodySchema.parse(req.body || {});
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({
        error: 'Dados inválidos.',
        code: 'INVALID_CHECKOUT_CONTEXT',
        details: e.errors,
      });
      return;
    }
    throw e;
  }

  try {
    const em = normalizeEmailForUniqueness(body.email);
    const wa = normalizeWhatsappDigits(body.whatsapp);
    if (!wa || wa.length < 8) {
      jsonError(res, 400, 'Informe um WhatsApp válido com DDD.', 'INVALID_CHECKOUT_CONTEXT');
      return;
    }
    await assertAdminEmailAvailableForCheckout(em);
    await assertAdminWhatsappAvailableForCheckout(wa);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errCode = (error as Error & { code?: string }).code;
    if (message === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' || errCode === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN') {
      jsonError(
        res,
        400,
        'Este e-mail já possui cadastro. Faça login ou use outro e-mail.',
        'EMAIL_ALREADY_REGISTERED_USE_LOGIN'
      );
      return;
    }
    if (message === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN' || errCode === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN') {
      jsonError(
        res,
        400,
        'Este WhatsApp já possui cadastro. Faça login ou use outro número.',
        'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN'
      );
      return;
    }
    console.error('postValidateCheckoutAdmin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
