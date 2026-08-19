/**
 * M5 S7.2 — signup público do canal Partner (trial + cobrança no gateway do Partner).
 * Não usa plan-purchase / exclusive_signup.
 */

import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { createTenantAdminUser } from '../services/tenantAdminService.js';
import { createInvoice, ensureTenantBillingInlinePayToken, type BillingInterval } from '../services/invoiceService.js';
import {
  prepareSaasCheckoutPaymentMethodForBilling,
  type PlanCheckoutPendingPayload,
} from '../services/subscriptionService.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { generateToken } from '../utils/jwt.js';
import { normalizeEmailForUniqueness } from '../utils/userIdentity.js';
import {
  assertAdminEmailAvailableForCheckout,
  assertAdminWhatsappAvailableForCheckout,
  normalizeWhatsappDigits,
} from '../services/userIdentityValidationService.js';
import { slugifyOperationalName } from '../acquisition/tenantOperationalSlug.js';
import { schedulePublishPlatformBillingChargeCreated } from '../services/platformNotifications/platformBusinessNotifications.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { findActiveSellerOnPartner, findPartnerIdBySlug } from './partnerAttribution.js';
import { isPartnerChannelEnabled } from './partnerFlags.js';
import {
  assertPartnerPoolAllowsNewUser,
  canPartnerSellWithGateway,
  refreshPartnerUsedSeatsCache,
} from './partnerLicenseService.js';
import { getPartnerProfile, resolveDefaultPlanId } from './partnerRepository.js';
import { getPartnerSellPlan, type PartnerSellPlanRow } from './partnerSellPlanService.js';
import {
  ensureTenantBillingDocumentForPayment,
  mapPartnerChannelAsaasDocumentError,
  normalizeOptionalBillingDocument,
} from './partnerChannelBillingDocument.js';

export type PartnerChannelSignupInput = {
  partner_slug: string;
  partner_sell_plan_id: string;
  seller_user_id?: string | null;
  company_name: string;
  /** E-mail de login do administrador. */
  email: string;
  /** E-mail de contato principal da empresa (tenants.billing_email). */
  billing_email?: string | null;
  responsible_name: string;
  password: string;
  whatsapp: string;
  cpf_cnpj?: string | null;
  phone?: string | null;
  /** Reuso após 1ª cobrança (troca de método). */
  tenant_id?: string | null;
  payment_method?: PaymentMethod;
  host?: string | null;
};

export type PartnerChannelTrialResult = {
  token: string;
  tenant_id: string;
  user: {
    id: string;
    email: string;
    tenant_id: string;
    registration_complete: true;
  };
  trial_ends_at: string | null;
  partner_sell_plan_id: string;
};

export type PartnerChannelPaidResult = PlanCheckoutPendingPayload & {
  tenant_id: string;
  partner_sell_plan_id: string;
  amount_cents: number;
};

function mapSellInterval(interval: string): BillingInterval {
  if (interval === 'semiannual') return 'semi_annual';
  if (
    interval === 'monthly' ||
    interval === 'quarterly' ||
    interval === 'yearly' ||
    interval === 'weekly' ||
    interval === 'semi_annual'
  ) {
    return interval;
  }
  return 'monthly';
}

async function uniqueCustomerSlug(client: PoolClient, companyName: string): Promise<string> {
  const baseSlug = slugifyOperationalName(companyName) || 'cliente';
  let slug = baseSlug;
  let suffix = 0;
  for (;;) {
    const exists = await client.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (exists.rows.length === 0) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

async function resolvePartnerContext(input: {
  partner_slug: string;
  seller_user_id?: string | null;
  host?: string | null;
}): Promise<{ partnerId: string; sellerUserId: string | null }> {
  if (!(await isPartnerChannelEnabled())) {
    throw new PartnerAdminError('Canal Partner desativado', 'PARTNER_CHANNEL_DISABLED', 403);
  }

  let partnerId = await findPartnerIdBySlug(input.partner_slug);
  if (!partnerId && input.host) {
    const { resolvePartnerBrandByHost, normalizeHostname } = await import('./partnerBrandResolver.js');
    const brand = await resolvePartnerBrandByHost(normalizeHostname(input.host));
    if (brand) partnerId = brand.partner_tenant_id;
  }
  if (!partnerId) {
    throw new PartnerAdminError('Partner não encontrado', 'PARTNER_NOT_FOUND', 404);
  }

  const profile = await getPartnerProfile(partnerId);
  if (!profile || profile.status === 'suspended') {
    throw new PartnerAdminError('Partner indisponível', 'PARTNER_SUSPENDED', 403);
  }

  let sellerUserId: string | null = null;
  if (input.seller_user_id?.trim()) {
    const seller = await findActiveSellerOnPartner(partnerId, input.seller_user_id.trim());
    if (!seller) {
      throw new PartnerAdminError('Vendedor inválido para este Partner', 'SELLER_INVALID', 400);
    }
    sellerUserId = seller.user_id;
  }

  return { partnerId, sellerUserId };
}

async function loadActiveSellPlan(
  partnerId: string,
  sellPlanId: string
): Promise<PartnerSellPlanRow> {
  const sell = await getPartnerSellPlan(partnerId, sellPlanId);
  if (!sell || sell.status !== 'active') {
    throw new PartnerAdminError('Plano de venda inválido ou inativo', 'SELL_PLAN_INVALID', 400);
  }
  return sell;
}

async function resolveEnvelopePlanId(sell: PartnerSellPlanRow): Promise<string> {
  if (sell.source_platform_plan_id) return sell.source_platform_plan_id;
  const def = await resolveDefaultPlanId();
  if (!def) {
    throw new PartnerAdminError('Nenhum plano de plataforma disponível', 'PLAN_REQUIRED', 500);
  }
  return def;
}

async function assertSignupIdentities(email: string, whatsappDigits: string): Promise<void> {
  try {
    await assertAdminEmailAvailableForCheckout(email);
    await assertAdminWhatsappAvailableForCheckout(whatsappDigits);
  } catch (err) {
    const code = (err as Error & { code?: string }).code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('EMAIL_ALREADY')) {
      throw new PartnerAdminError(
        'Este e-mail já possui cadastro. Faça login ou use outro e-mail.',
        'EMAIL_ALREADY_REGISTERED_USE_LOGIN',
        400
      );
    }
    if (code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN' || msg.includes('WHATSAPP_ALREADY')) {
      throw new PartnerAdminError(
        'Este WhatsApp já possui cadastro. Faça login ou use outro número.',
        'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN',
        400
      );
    }
    throw err;
  }
}

function parseSignupBasics(input: PartnerChannelSignupInput): {
  companyName: string;
  adminEmail: string;
  billingEmail: string;
  adminName: string;
  password: string;
  whatsappDigits: string;
  cpfDigits: string | null;
  phone: string | null;
} {
  const companyName = input.company_name.trim();
  if (companyName.length < 2) {
    throw new PartnerAdminError('Informe o nome da empresa', 'COMPANY_REQUIRED', 400);
  }
  const adminEmail = normalizeEmailForUniqueness(input.email);
  const billingRaw = (input.billing_email ?? '').trim();
  const billingEmail = billingRaw
    ? normalizeEmailForUniqueness(billingRaw)
    : adminEmail;
  const adminName = input.responsible_name.trim();
  if (!adminName) {
    throw new PartnerAdminError('Informe o nome do administrador', 'ADMIN_NAME_REQUIRED', 400);
  }
  const password = input.password.trim();
  if (password.length < 8) {
    throw new PartnerAdminError('Senha mínima de 8 caracteres', 'PASSWORD_WEAK', 400);
  }
  const whatsappDigits = normalizeWhatsappDigits(input.whatsapp);
  if (!whatsappDigits || whatsappDigits.length < 8) {
    throw new PartnerAdminError('Informe um WhatsApp válido com DDD', 'WHATSAPP_REQUIRED', 400);
  }
  const cpfDigits = normalizeOptionalBillingDocument(input.cpf_cnpj);
  const phoneDigits = input.phone?.replace(/\D/g, '') ?? '';
  const phone = phoneDigits.length >= 8 ? phoneDigits : null;
  return {
    companyName,
    adminEmail,
    billingEmail,
    adminName,
    password,
    whatsappDigits,
    cpfDigits,
    phone,
  };
}

async function bootstrapTenant(tenantId: string): Promise<void> {
  try {
    const { ensureTenantOperationalBootstrap } = await import(
      '../services/tenantOperationalBootstrapService.js'
    );
    const admin = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [tenantId]
    );
    if (admin.rows[0]) {
      await ensureTenantOperationalBootstrap({
        tenantId,
        adminUserId: admin.rows[0].id,
      });
    }
  } catch (bootstrapErr) {
    console.warn('[partner-channel] bootstrap failed', { tenantId, err: bootstrapErr });
  }
}

async function issueAuthPayload(tenantId: string, email: string): Promise<PartnerChannelTrialResult['user'] & { token: string }> {
  const userRow = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [tenantId]
  );
  const user = userRow.rows[0];
  if (!user) {
    throw new PartnerAdminError('Admin não encontrado após signup', 'ADMIN_MISSING', 500);
  }
  const token = generateToken({ userId: user.id, email: user.email || email });
  return {
    token,
    id: user.id,
    email: user.email,
    tenant_id: tenantId,
    registration_complete: true as const,
  };
}

/**
 * Trial (ou plano grátis): provisiona customer_tenant ativo/trial + JWT.
 */
export async function signupPartnerChannelTrial(
  input: PartnerChannelSignupInput
): Promise<PartnerChannelTrialResult> {
  const basics = parseSignupBasics(input);
  const { partnerId, sellerUserId } = await resolvePartnerContext(input);
  const sell = await loadActiveSellPlan(partnerId, input.partner_sell_plan_id);
  const trialDays = Math.max(0, sell.trial_days || 0);
  const isFree = sell.price_cents <= 0;

  if (trialDays < 1 && !isFree) {
    throw new PartnerAdminError(
      'Este plano não oferece trial. Use o fluxo de pagamento.',
      'PLAN_HAS_NO_TRIAL',
      400
    );
  }

  await assertSignupIdentities(basics.adminEmail, basics.whatsappDigits);
  await assertPartnerPoolAllowsNewUser(partnerId, 1);

  const planId = await resolveEnvelopePlanId(sell);
  const tenantStatus = trialDays > 0 ? 'trial' : 'active';

  const client = await pool.connect();
  let tenantId: string;
  let trialEndsAt: string | null = null;
  try {
    await client.query('BEGIN');
    const slug = await uniqueCustomerSlug(client, basics.companyName);
    const inserted = await client.query<{ id: string; trial_ends_at: string | null }>(
      `INSERT INTO tenants (
         name, slug, plan_id, status, created_via,
         billing_email, billing_phone, cpf_cnpj, responsible_name,
         onboarding_completed, account_type, partner_id, seller_user_id,
         max_users_override, partner_sell_plan_id,
         trial_ends_at, has_used_trial, trial_consumed_at
       ) VALUES (
         $1, $2, $3, $4::text, 'partner',
         $5, $6, $7, $8,
         true, 'customer_tenant', $9, $10,
         1, $11,
         CASE WHEN $12::int > 0 THEN now() + ($12::int * interval '1 day') ELSE NULL END,
         CASE WHEN $12::int > 0 THEN true ELSE false END,
         CASE WHEN $12::int > 0 THEN now() ELSE NULL END
       )
       RETURNING id, trial_ends_at::text AS trial_ends_at`,
      [
        basics.companyName,
        slug,
        planId,
        tenantStatus,
        basics.billingEmail,
        basics.phone,
        basics.cpfDigits,
        basics.adminName,
        partnerId,
        sellerUserId,
        sell.id,
        trialDays,
      ]
    );
    tenantId = inserted.rows[0].id;
    trialEndsAt = inserted.rows[0].trial_ends_at;

    await client.query(
      `INSERT INTO tenant_plan (tenant_id, plan_id, starts_at) VALUES ($1, $2, now())`,
      [tenantId, planId]
    );

    await createTenantAdminUser(
      {
        tenantId,
        tenantName: basics.companyName,
        email: basics.adminEmail,
        responsibleName: basics.adminName,
        password: basics.password,
        whatsappDigits: basics.whatsappDigits,
      },
      { db: client }
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    const code = (err as { code?: string })?.code;
    if (
      code === 'EMAIL_GLOBAL_DUPLICATE' ||
      (err as Error)?.message === 'EMAIL_ALREADY_REGISTERED_OTHER_TENANT'
    ) {
      throw new PartnerAdminError(
        'Este e-mail já possui cadastro. Faça login ou use outro e-mail.',
        'EMAIL_ALREADY_REGISTERED_USE_LOGIN',
        400
      );
    }
    throw err;
  } finally {
    client.release();
  }

  await refreshPartnerUsedSeatsCache(partnerId);
  await bootstrapTenant(tenantId);

  const auth = await issueAuthPayload(tenantId, basics.adminEmail);
  return {
    token: auth.token,
    tenant_id: tenantId,
    user: {
      id: auth.id,
      email: auth.email,
      tenant_id: tenantId,
      registration_complete: true,
    },
    trial_ends_at: trialEndsAt,
    partner_sell_plan_id: sell.id,
  };
}

async function preparePaidPayload(
  tenantId: string,
  billingId: string,
  paymentMethod: PaymentMethod,
  sellPlanId: string
): Promise<PartnerChannelPaidResult> {
  let pending;
  try {
    pending = await prepareSaasCheckoutPaymentMethodForBilling(
      tenantId,
      billingId,
      paymentMethod
    );
  } catch (err) {
    const docErr = mapPartnerChannelAsaasDocumentError(err);
    if (docErr) throw docErr;
    throw err;
  }
  if (!pending) {
    throw new PartnerAdminError(
      'Não foi possível preparar o pagamento no gateway do Partner. Verifique a configuração Asaas.',
      'GATEWAY_PREPARE_FAILED',
      400
    );
  }

  let inline_pay_token = pending.inline_pay_token;
  if (!inline_pay_token) {
    try {
      inline_pay_token = await ensureTenantBillingInlinePayToken(billingId);
    } catch {
      /* ignore */
    }
  }

  return {
    ...pending,
    inline_pay_token,
    tenant_id: tenantId,
    partner_sell_plan_id: sellPlanId,
    amount_cents: pending.amount_cents,
  };
}

/**
 * Signup pago: customer_tenant payment_pending + fatura no preço do sell plan + prepare payment.
 */
export async function signupPartnerChannelPaid(
  input: PartnerChannelSignupInput
): Promise<PartnerChannelPaidResult> {
  const paymentMethod = input.payment_method;
  const shouldPreparePayment =
    paymentMethod != null && ['PIX', 'BOLETO', 'CREDIT_CARD'].includes(paymentMethod);

  const { partnerId, sellerUserId } = await resolvePartnerContext(input);
  const sell = await loadActiveSellPlan(partnerId, input.partner_sell_plan_id);

  if (sell.price_cents <= 0) {
    throw new PartnerAdminError(
      'Plano grátis: use o fluxo de trial/ativação.',
      'PLAN_IS_FREE',
      400
    );
  }

  const gatewayOk = await canPartnerSellWithGateway(partnerId);
  if (!gatewayOk.ok) {
    throw new PartnerAdminError(
      'Gateway de pagamento do Partner não está pronto para cobrar.',
      'GATEWAY_NOT_READY',
      409
    );
  }

  const planId = await resolveEnvelopePlanId(sell);
  const interval = mapSellInterval(sell.billing_interval);

  // Reuso: troca de método em tenant payment_pending do mesmo Partner
  if (input.tenant_id?.trim()) {
    const existing = await pool.query<{
      id: string;
      partner_id: string | null;
      status: string;
      partner_sell_plan_id: string | null;
    }>(
      `SELECT id, partner_id::text AS partner_id, status,
              partner_sell_plan_id::text AS partner_sell_plan_id
       FROM tenants
       WHERE id = $1 AND account_type = 'customer_tenant'
       LIMIT 1`,
      [input.tenant_id.trim()]
    );
    const row = existing.rows[0];
    if (!row || row.partner_id !== partnerId) {
      throw new PartnerAdminError('Conta de checkout inválida', 'INVALID_CHECKOUT_CONTEXT', 400);
    }
    if (row.status !== 'payment_pending' && row.status !== 'trial') {
      throw new PartnerAdminError('Conta já ativada. Faça login.', 'ALREADY_ACTIVE', 400);
    }

    await ensureTenantBillingDocumentForPayment(row.id, input.cpf_cnpj);

    let billingId: string | null = null;
    const open = await pool.query<{ id: string }>(
      `SELECT id FROM tenant_billing
       WHERE tenant_id = $1
         AND status IN ('pending', 'waiting_payment', 'processing', 'overdue')
       ORDER BY created_at DESC
       LIMIT 1`,
      [row.id]
    );
    billingId = open.rows[0]?.id ?? null;

    if (!billingId) {
      const due = new Date();
      due.setDate(due.getDate() + 7);
      const billing = await createInvoice({
        tenant_id: row.id,
        plan_id: planId,
        billing_interval: interval,
        amount_cents: sell.price_cents,
        due_date: due,
        source: 'self_service',
        billing_reason: 'plan_purchase',
        gateway: 'asaas',
        plan_name_snapshot: sell.name,
        plan_price_snapshot: sell.price_cents,
      });
      billingId = billing.id;
      schedulePublishPlatformBillingChargeCreated(billing.id);
    }

    await pool.query(
      `UPDATE tenants SET partner_sell_plan_id = $1, plan_id = $2, updated_at = now() WHERE id = $3`,
      [sell.id, planId, row.id]
    );

    if (!shouldPreparePayment) {
      return {
        tenant_id: row.id,
        billing_id: billingId!,
        amount_cents: sell.price_cents,
        partner_sell_plan_id: sell.id,
        status: 'pending',
      };
    }

    return preparePaidPayload(row.id, billingId!, paymentMethod!, sell.id);
  }

  const basics = parseSignupBasics(input);
  await assertSignupIdentities(basics.adminEmail, basics.whatsappDigits);
  await assertPartnerPoolAllowsNewUser(partnerId, 1);

  const client = await pool.connect();
  let tenantId: string;
  try {
    await client.query('BEGIN');
    const slug = await uniqueCustomerSlug(client, basics.companyName);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tenants (
         name, slug, plan_id, status, created_via,
         billing_email, billing_phone, cpf_cnpj, responsible_name,
         onboarding_completed, account_type, partner_id, seller_user_id,
         max_users_override, partner_sell_plan_id
       ) VALUES (
         $1, $2, $3, 'payment_pending', 'partner',
         $4, $5, $6, $7,
         true, 'customer_tenant', $8, $9,
         1, $10
       )
       RETURNING id`,
      [
        basics.companyName,
        slug,
        planId,
        basics.billingEmail,
        basics.phone,
        basics.cpfDigits,
        basics.adminName,
        partnerId,
        sellerUserId,
        sell.id,
      ]
    );
    tenantId = inserted.rows[0].id;

    await client.query(
      `INSERT INTO tenant_plan (tenant_id, plan_id, starts_at) VALUES ($1, $2, now())`,
      [tenantId, planId]
    );

    await createTenantAdminUser(
      {
        tenantId,
        tenantName: basics.companyName,
        email: basics.adminEmail,
        responsibleName: basics.adminName,
        password: basics.password,
        whatsappDigits: basics.whatsappDigits,
      },
      { db: client }
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    const code = (err as { code?: string })?.code;
    if (
      code === 'EMAIL_GLOBAL_DUPLICATE' ||
      (err as Error)?.message === 'EMAIL_ALREADY_REGISTERED_OTHER_TENANT'
    ) {
      throw new PartnerAdminError(
        'Este e-mail já possui cadastro. Faça login ou use outro e-mail.',
        'EMAIL_ALREADY_REGISTERED_USE_LOGIN',
        400
      );
    }
    throw err;
  } finally {
    client.release();
  }

  await refreshPartnerUsedSeatsCache(partnerId);
  await bootstrapTenant(tenantId);

  await ensureTenantBillingDocumentForPayment(tenantId, input.cpf_cnpj);

  const due = new Date();
  due.setDate(due.getDate() + 7);
  const billing = await createInvoice({
    tenant_id: tenantId,
    plan_id: planId,
    billing_interval: interval,
    amount_cents: sell.price_cents,
    due_date: due,
    source: 'self_service',
    billing_reason: 'plan_purchase',
    gateway: 'asaas',
    plan_name_snapshot: sell.name,
    plan_price_snapshot: sell.price_cents,
  });
  schedulePublishPlatformBillingChargeCreated(billing.id);

  if (!shouldPreparePayment) {
    return {
      tenant_id: tenantId,
      billing_id: billing.id,
      amount_cents: billing.amount_cents,
      partner_sell_plan_id: sell.id,
      status: 'pending',
    };
  }

  return preparePaidPayload(tenantId, billing.id, paymentMethod!, sell.id);
}

export async function validatePartnerChannelAdmin(input: {
  email: string;
  whatsapp: string;
}): Promise<{ ok: true }> {
  const email = normalizeEmailForUniqueness(input.email);
  const wa = normalizeWhatsappDigits(input.whatsapp);
  if (!email.includes('@')) {
    throw new PartnerAdminError('E-mail inválido', 'EMAIL_INVALID', 400);
  }
  if (!wa || wa.length < 8) {
    throw new PartnerAdminError('WhatsApp inválido', 'WHATSAPP_REQUIRED', 400);
  }
  await assertSignupIdentities(email, wa);
  return { ok: true };
}
