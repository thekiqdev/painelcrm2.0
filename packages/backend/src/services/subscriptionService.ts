/**
 * Orquestração: compra de plano (subscribePlan) e ativação a partir da fatura (activatePlanFromBilling).
 * Utiliza billingService, invoiceService e gatewayProvider.
 */
import { pool, withTenantRlsContext } from '../utils/db.js';
import {
  calculateInvoiceAmount,
  validatePlanForPurchase,
  type BillingInterval,
} from './billingService.js';
import {
  createInvoice,
  getInvoiceById,
  updateInvoiceGatewayData,
  setBillingSubscriptionId,
  buildSaasCheckoutChargeIdempotencyKey,
  findReusableSaasPlanCheckoutInvoice,
  cancelOpenPlanPurchaseBillingsForContext,
  cancelOpenSeatAddonBillingsExcept,
  SAAS_PLAN_CHECKOUT_REUSABLE_STATUSES,
  SAAS_PLAN_SIBLING_OPEN_STATUSES,
  ensureTenantBillingInlinePayToken,
  type BillingReason,
  type CreateInvoiceInput,
  type TenantBillingRow,
} from './invoiceService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';
import type { PaymentGateway, PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import {
  changeSubscriptionPlan,
  createSubscription,
  getActiveSaasSubscriptionByTenant,
  patchActiveSaasSubscriptionIncompletePeriods,
  toYmd,
} from './billingSubscriptionService.js';
import { getBillingSettings } from './billingSettingsService.js';
import {
  isPhase2TrialCrmGateEnabled,
  isTrialExpirationJobEnabled,
} from '../config/checkoutTrialFeatureFlags.js';
import { isAttemptChargeStillUsable } from './invoicePaymentAttemptReuseService.js';
import { hasTenantBillingPaymentAttemptsTable } from './tenantBillingPaymentAttemptsService.js';
import { ensureSaasPlanCheckoutPaymentAttemptForSwitch } from './saasPlanCheckoutPaymentAttemptService.js';

/** Erro do gateway/Asaas relacionado a documento — tratado no plan-purchase como 400 + field cpf_cnpj. */
export const ASAAS_CPF_CNPJ_USER_MESSAGE =
  'CPF/CNPJ inválido ou ausente no cadastro. Revise os dados e tente novamente.';

function mapAsaasChargeError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes('cpf') ||
    lower.includes('cnpj') ||
    lower.includes('documento') ||
    lower.includes('cpfcnpj')
  ) {
    return new Error(ASAAS_CPF_CNPJ_USER_MESSAGE);
  }
  try {
    const idx = raw.indexOf('{');
    if (idx >= 0) {
      const j = JSON.parse(raw.slice(idx)) as { errors?: Array<{ description?: string }> };
      const desc = (j.errors ?? []).map((e) => e.description ?? '').join(' ');
      if (/cpf|cnpj|documento/i.test(desc)) {
        return new Error(ASAAS_CPF_CNPJ_USER_MESSAGE);
      }
    }
  } catch {
    /* ignore JSON parse */
  }
  return err instanceof Error ? err : new Error(raw);
}

/**
 * Adiciona intervalo à data (monthly, quarterly, semi_annual, yearly).
 * Usado para calcular plan_period_end no backend (fonte de verdade).
 * Atenção: em datas como 31/01, setMonth(+1) pode gerar 03/03 (rollover JS); para próximo ciclo de cobrança use calculateNextBillingDate.
 */
export function addInterval(date: Date, interval: BillingInterval): Date {
  const result = new Date(date);
  switch (interval) {
    case 'monthly':
      result.setMonth(result.getMonth() + 1);
      break;
    case 'quarterly':
      result.setMonth(result.getMonth() + 3);
      break;
    case 'semi_annual':
      result.setMonth(result.getMonth() + 6);
      break;
    case 'yearly':
      result.setFullYear(result.getFullYear() + 1);
      break;
    default:
      result.setMonth(result.getMonth() + 1);
  }
  return result;
}

/**
 * Calcula a próxima data de cobrança respeitando billing_anchor_day e último dia do mês (Stripe/Chargebee).
 * Regra: next_day = MIN(anchor_day, last_day_of_month) no mês alvo.
 * Ex.: 31 Jan + 1 mês → 28 Fev; 31 Mar + 1 mês → 30 Abr; dia 15 → sempre dia 15.
 */
export function calculateNextBillingDate(
  periodStart: string,
  billingInterval: BillingInterval,
  billingAnchorDay: number | null
): string {
  const d = new Date(periodStart + 'T12:00:00Z');
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const dayOfPeriod = d.getUTCDate();
  const anchor = billingAnchorDay ?? dayOfPeriod;

  switch (billingInterval) {
    case 'monthly':
      m += 1;
      break;
    case 'quarterly':
      m += 3;
      break;
    case 'semi_annual':
      m += 6;
      break;
    case 'yearly':
      y += 1;
      break;
    default:
      m += 1;
  }
  if (m > 11) {
    y += Math.floor(m / 12);
    m = m % 12;
  }

  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(anchor, lastDay);
  const next = new Date(Date.UTC(y, m, day));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Cria/recupera assinatura saas e vincula à fatura, sempre sob `app.current_tenant_id` (RLS em `subscriptions` / `tenant_billing`).
 * Sem isso, INSERT/SELECT no pool global falham ou ficam invisíveis e o tenant fica “ativo” sem linha em `subscriptions`.
 */
async function ensureSaasSubscriptionAfterPaidActivation(params: {
  tenantId: string;
  planId: string;
  billingInterval: BillingInterval;
  periodStartStr: unknown;
  periodEndStr: unknown;
  amountCents: number;
  usersCount: number | null;
  billingId: string;
}): Promise<void> {
  const periodStartStr = toYmd(params.periodStartStr) ?? '';
  const periodEndStr = toYmd(params.periodEndStr) ?? '';
  if (!periodStartStr || !periodEndStr) {
    console.error(
      '[SUBSCRIPTION] ensureSaasSubscriptionAfterPaidActivation: períodos inválidos após normalização',
      { tenantId: params.tenantId, billingId: params.billingId }
    );
    throw new Error('Períodos de assinatura inválidos');
  }

  const { tenantId, planId, billingInterval, amountCents, usersCount, billingId } = params;

  await withTenantRlsContext(tenantId, async () => {
    let activeSub = await getActiveSaasSubscriptionByTenant(tenantId);
    if (!activeSub) {
      const config = await getActiveConfig('saas');
      const gatewayKey = config?.gateway_key ?? 'asaas';
      const billingSettings = await getBillingSettings();
      const dayPart = parseInt(periodStartStr.slice(8, 10), 10);
      const billing_anchor_day =
        Number.isFinite(dayPart) && dayPart >= 1 && dayPart <= 31 ? dayPart : 1;

      try {
        activeSub = await createSubscription({
          type: 'saas',
          tenant_id: tenantId,
          plan_id: planId,
          amount_cents: amountCents,
          billing_interval: billingInterval,
          next_billing_date: periodEndStr,
          current_period_start: periodStartStr,
          current_period_end: periodEndStr,
          billing_anchor_day,
          grace_period_days: billingSettings.grace_period_days,
          users_count: usersCount,
          gateway: gatewayKey,
          created_by: 'checkout',
        });
      } catch (e: unknown) {
        const pgCode =
          typeof e === 'object' && e !== null && 'code' in e
            ? String((e as { code: unknown }).code)
            : '';
        if (pgCode === '23505') {
          activeSub = await getActiveSaasSubscriptionByTenant(tenantId);
        }
        if (!activeSub) throw e;
      }
    }

    if (activeSub && periodStartStr && periodEndStr) {
      const incomplete = !activeSub.current_period_start || !activeSub.current_period_end;
      if (incomplete) {
        await patchActiveSaasSubscriptionIncompletePeriods({
          tenantId,
          subscriptionId: activeSub.id,
          periodStart: periodStartStr,
          periodEnd: periodEndStr,
          planId,
          billingInterval,
          amountCents,
          usersCount,
        });
      }
    }

    const billingFresh = await getInvoiceById(billingId);
    const subAfter = await getActiveSaasSubscriptionByTenant(tenantId);
    if (subAfter && billingFresh && !billingFresh.subscription_id) {
      await setBillingSubscriptionId(billingId, subAfter.id);
    }
  });
}

/**
 * Auto-cura: tenant `active` com fatura de plano paga mas sem assinatura SaaS utilizável (webhook/legado).
 * Idempotente. Não roda para trial sem pagamento (exige fatura `paid` de plano).
 */
export async function ensureUsableSaasSubscriptionForActivePaidTenant(tenantId: string): Promise<void> {
  const quick = await getActiveSaasSubscriptionByTenant(tenantId);
  if (quick?.current_period_start && quick?.current_period_end) return;

  const tr = await pool.query<{
    status: string;
    activated_billing_id: string | null;
    plan_id: string | null;
    plan_period_start: unknown;
    plan_period_end: unknown;
  }>(
    `SELECT status, activated_billing_id, plan_id, plan_period_start, plan_period_end
     FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const trow = tr.rows[0];
  if (!trow || trow.status !== 'active') return;

  let billing: TenantBillingRow | null = null;
  if (trow.activated_billing_id) {
    const inv = await getInvoiceById(trow.activated_billing_id);
    if (
      inv &&
      inv.status === 'paid' &&
      inv.tenant_id === tenantId &&
      (inv.billing_reason ?? 'plan_purchase') !== 'seat_addon'
    ) {
      billing = inv;
    }
  }
  if (!billing) {
    const fr = await pool.query<{ id: string }>(
      `SELECT id FROM tenant_billing
       WHERE tenant_id = $1 AND status = 'paid'
         AND COALESCE(billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade', 'plan_renewal')
       ORDER BY COALESCE(paid_at, updated_at) DESC NULLS LAST
       LIMIT 1`,
      [tenantId]
    );
    const bid = fr.rows[0]?.id;
    if (bid) billing = await getInvoiceById(bid);
  }
  if (!billing || billing.status !== 'paid') return;

  let periodStartStr = toYmd(trow.plan_period_start);
  let periodEndStr = toYmd(trow.plan_period_end);
  const planIdForSync = trow.plan_id ?? billing.plan_id;
  const billingInterval = (billing.billing_interval ?? 'monthly') as BillingInterval;

  if (!periodStartStr || !periodEndStr) {
    periodStartStr = periodStartStr ?? toYmd(billing.period_start);
    periodEndStr = periodEndStr ?? toYmd(billing.period_end);
  }

  if (!periodStartStr || !periodEndStr) {
    const periodStart = new Date();
    const periodEnd = addInterval(periodStart, billingInterval);
    periodStartStr = periodStart.toISOString().slice(0, 10);
    periodEndStr = periodEnd.toISOString().slice(0, 10);
    await pool.query(
      `UPDATE tenants
       SET plan_period_start = COALESCE(plan_period_start, $1),
           plan_period_end = COALESCE(plan_period_end, $2),
           updated_at = now()
       WHERE id = $3`,
      [periodStartStr, periodEndStr, tenantId]
    );
  }

  await ensureSaasSubscriptionAfterPaidActivation({
    tenantId,
    planId: planIdForSync ?? billing.plan_id,
    billingInterval,
    periodStartStr,
    periodEndStr,
    amountCents: billing.amount_cents,
    usersCount: billing.users_count != null ? billing.users_count : null,
    billingId: billing.id,
  });
}

/**
 * Após pagamento de fatura `seat_addon`: aumenta assentos contratados e sincroniza assinatura SaaS.
 * Não altera plan_period nem activated_billing_id. Downgrade agendado é anulado ao confirmar expansão paga.
 */
async function activateSeatAddonFromBilling(billing: TenantBillingRow): Promise<void> {
  const newTotal = billing.users_count;
  if (newTotal == null || newTotal < 1) {
    console.warn('[SUBSCRIPTION] seat_addon sem users_count válido', { billingId: billing.id });
    return;
  }
  const r = await pool.query(
    `UPDATE tenants
     SET max_users_override = $1,
         seat_addon_pending_billing_id = NULL,
         max_users_scheduled_next_cycle = NULL,
         updated_at = now()
     WHERE id = $2 AND seat_addon_pending_billing_id = $3`,
    [newTotal, billing.tenant_id, billing.id]
  );
  if ((r.rowCount ?? 0) === 0) {
    const check = await pool.query<{ mu: number | null }>(
      `SELECT max_users_override AS mu FROM tenants WHERE id = $1`,
      [billing.tenant_id]
    );
    const mu = check.rows[0]?.mu;
    if (mu != null && mu >= newTotal) {
      console.log('[SUBSCRIPTION] seat_addon idempotente — assentos já aplicados', { billingId: billing.id });
      return;
    }
    console.warn('[SUBSCRIPTION] seat_addon: pending pointer não casou; não aplicado', {
      tenantId: billing.tenant_id,
      billingId: billing.id,
    });
    return;
  }

  const sub = await getActiveSaasSubscriptionByTenant(billing.tenant_id);
  if (sub) {
    const sync = await changeSubscriptionPlan(sub.id, billing.tenant_id, {
      plan_id: billing.plan_id,
      users_count: newTotal,
      billing_interval: (billing.billing_interval ?? sub.billing_interval) as BillingInterval,
    });
    if (!sync.ok) {
      console.error('[SUBSCRIPTION] seat_addon: falha ao sincronizar subscriptions', sync.error);
    }
  }
}

/**
 * Ativa o plano no tenant a partir da fatura paga.
 * Sempre calcula plan_period_start e plan_period_end no backend (nunca copia do gateway).
 * Idempotente: não reexecuta se o tenant já estiver ativo com esta fatura (evita duplicação webhook + polling).
 */
export async function activatePlanFromBilling(billingId: string): Promise<void> {
  const billing = await getInvoiceById(billingId);
  if (!billing) {
    console.log('[SUBSCRIPTION] activatePlanFromBilling: billing não encontrado', billingId);
    return;
  }
  if (billing.status !== 'paid') {
    console.log('[SUBSCRIPTION] activatePlanFromBilling: billing não está paid', { billingId, status: billing.status });
    return;
  }

  const billingReason = billing.billing_reason ?? 'plan_purchase';
  if (billingReason === 'seat_addon') {
    await activateSeatAddonFromBilling(billing);
    return;
  }

  const tenantCheck = await pool.query<{ status: string; activated_billing_id: string | null }>(
    `SELECT status, activated_billing_id FROM tenants WHERE id = $1`,
    [billing.tenant_id]
  );
  const tenant = tenantCheck.rows[0];
  if (tenant?.status === 'active' && tenant.activated_billing_id === billingId) {
    const tr = await pool.query<{
      plan_period_start: string | null;
      plan_period_end: string | null;
      plan_id: string;
    }>(`SELECT plan_period_start, plan_period_end, plan_id FROM tenants WHERE id = $1`, [billing.tenant_id]);
    const trow = tr.rows[0];
    let periodStartStr = trow?.plan_period_start ?? null;
    let periodEndStr = trow?.plan_period_end ?? null;
    const planIdForSync = trow?.plan_id ?? billing.plan_id;
    const billingInterval = (billing.billing_interval ?? 'monthly') as BillingInterval;

    if (!periodStartStr || !periodEndStr) {
      const inv = await pool.query<{ ps: string | null; pe: string | null }>(
        `SELECT period_start::text AS ps, period_end::text AS pe FROM tenant_billing WHERE id = $1`,
        [billingId]
      );
      periodStartStr = inv.rows[0]?.ps ?? periodStartStr;
      periodEndStr = inv.rows[0]?.pe ?? periodEndStr;
    }

    if (!periodStartStr || !periodEndStr) {
      const periodStart = new Date();
      const periodEnd = addInterval(periodStart, billingInterval);
      periodStartStr = periodStart.toISOString().slice(0, 10);
      periodEndStr = periodEnd.toISOString().slice(0, 10);
      await pool.query(
        `UPDATE tenants
         SET plan_period_start = COALESCE(plan_period_start, $1),
             plan_period_end = COALESCE(plan_period_end, $2),
             updated_at = now()
         WHERE id = $3`,
        [periodStartStr, periodEndStr, billing.tenant_id]
      );
    }

    if (periodStartStr && periodEndStr) {
      console.log('[SUBSCRIPTION] activatePlanFromBilling: tenant já ativo com esta fatura, revalidando assinatura', {
        billingId,
      });
      await ensureSaasSubscriptionAfterPaidActivation({
        tenantId: billing.tenant_id,
        planId: planIdForSync,
        billingInterval,
        periodStartStr,
        periodEndStr,
        amountCents: billing.amount_cents,
        usersCount: billing.users_count != null ? billing.users_count : null,
        billingId,
      });
    } else {
      console.warn('[SUBSCRIPTION] activatePlanFromBilling: não foi possível derivar plan_period para sincronizar assinatura', {
        tenantId: billing.tenant_id,
        billingId,
      });
    }
    return;
  }

  console.log('[SUBSCRIPTION] ativando plano', {
    tenantId: billing.tenant_id,
    planId: billing.plan_id,
    billingId,
  });

  const tenantId = billing.tenant_id;

  await pool.query(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1
       AND id <> $2
       AND status = ANY($3::text[])
       AND COALESCE(billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade')`,
    [tenantId, billingId, SAAS_PLAN_SIBLING_OPEN_STATUSES]
  );

  const planId = billing.plan_id;
  const billingInterval = (billing.billing_interval ?? 'monthly') as BillingInterval;

  const periodStart = new Date();
  const periodEnd = addInterval(periodStart, billingInterval);
  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);

  const usersCount = billing.users_count != null ? billing.users_count : null;

  await pool.query(
    `UPDATE tenants
     SET plan_id = $1, status = 'active',
         plan_period_start = $2, plan_period_end = $3,
         activated_billing_id = $4,
         max_users_override = COALESCE($5, max_users_override),
         suspension_reason = NULL,
         suspended_at = NULL,
         updated_at = now()
     WHERE id = $6`,
    [planId, periodStartStr, periodEndStr, billingId, usersCount, tenantId]
  );

  await ensureSaasSubscriptionAfterPaidActivation({
    tenantId,
    planId,
    billingInterval,
    periodStartStr,
    periodEndStr,
    amountCents: billing.amount_cents,
    usersCount,
    billingId,
  });
}

export interface SubscribePlanResult {
  billing: TenantBillingRow;
  paymentUrls?: {
    invoiceUrl?: string;
    bankSlipUrl?: string;
    bankSlipDigitableLine?: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
  };
}

function normPaymentMethod(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase();
}

function paymentUrlsFromTenantBillingMetadata(meta: unknown): NonNullable<SubscribePlanResult['paymentUrls']> {
  const m = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  return {
    invoiceUrl: typeof m.invoiceUrl === 'string' ? m.invoiceUrl : undefined,
    bankSlipUrl: typeof m.bankSlipUrl === 'string' ? m.bankSlipUrl : undefined,
    bankSlipDigitableLine:
      typeof m.bankSlipDigitableLine === 'string' ? m.bankSlipDigitableLine : undefined,
    pixQrCode: typeof m.pixQrCode === 'string' ? m.pixQrCode : undefined,
    pixCopyPaste: typeof m.pixCopyPaste === 'string' ? m.pixCopyPaste : undefined,
  };
}

function hasPaymentPayloadForMethod(
  method: PaymentMethod,
  urls: NonNullable<SubscribePlanResult['paymentUrls']>
): boolean {
  if (method === 'PIX') {
    return !!(urls.pixQrCode?.trim() || urls.pixCopyPaste?.trim());
  }
  if (method === 'BOLETO') {
    return !!(
      urls.bankSlipUrl?.trim() ||
      urls.invoiceUrl?.trim() ||
      urls.bankSlipDigitableLine?.trim()
    );
  }
  if (method === 'CREDIT_CARD') {
    return !!(urls.invoiceUrl?.trim());
  }
  return false;
}

/**
 * Mesma ideia do link público de faturas (`ensureReusablePaymentAttemptForSwitch`): se a cobrança no gateway
 * continua utilizável e o método corresponde, devolve as URLs já persistidas sem novo `createCharge`.
 */
export async function resolveSaasPlanCheckoutPaymentIfEligible(
  billing: TenantBillingRow,
  requestedMethod: PaymentMethod,
  gateway: PaymentGateway,
  gatewayKey: string
): Promise<{ billing: TenantBillingRow; paymentUrls: NonNullable<SubscribePlanResult['paymentUrls']> } | null> {
  if (!SAAS_PLAN_CHECKOUT_REUSABLE_STATUSES.includes(billing.status)) return null;
  if (!billing.gateway_reference_id) return null;
  if (normPaymentMethod(billing.payment_method) !== normPaymentMethod(requestedMethod)) return null;

  const urls = paymentUrlsFromTenantBillingMetadata(billing.gateway_metadata);
  /** Hot path: payload já persistido + status reutilizável — evita GET /payments (latência/timeout no sandbox). */
  if (hasPaymentPayloadForMethod(requestedMethod, urls)) {
    return { billing, paymentUrls: urls };
  }

  const usable = await isAttemptChargeStillUsable(gateway, gatewayKey, billing.gateway_reference_id);
  if (!usable) return null;

  if (!hasPaymentPayloadForMethod(requestedMethod, urls)) return null;

  return { billing, paymentUrls: urls };
}

export type PlanCheckoutPendingPayload = {
  billing_id: string;
  invoice_number: string | null;
  amount_cents: number;
  status: string;
  tenant_id: string;
  payment_method?: string;
  invoice_url?: string;
  bank_slip_url?: string;
  bank_slip_digitable_line?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  /** Token para POST /api/billing/:id/pay-with-card no checkout sem JWT. */
  inline_pay_token?: string;
};

/**
 * Para GET /api/me/tenant/plan-checkout-pending: reapresenta cobrança compatível já gerada (sem POST).
 */
export async function getPendingSaasPlanCheckoutPresentation(
  tenantId: string,
  billingInterval: BillingInterval,
  usersCountOverride: number | null
): Promise<PlanCheckoutPendingPayload | null> {
  const t = await pool.query<{ plan_id: string | null; max_users_override: number | null }>(
    'SELECT plan_id, max_users_override FROM tenants WHERE id = $1',
    [tenantId]
  );
  const planId = t.rows[0]?.plan_id;
  if (!planId) return null;

  const planType = await pool.query<{ plan_type: string }>('SELECT plan_type FROM plans WHERE id = $1', [planId]);
  const isCustom = planType.rows[0]?.plan_type === 'custom';
  let usersCountNorm: number | null = null;
  if (isCustom) {
    usersCountNorm = usersCountOverride ?? t.rows[0]?.max_users_override ?? null;
    if (usersCountNorm == null || usersCountNorm < 1) return null;
  }

  await validatePlanForPurchase(planId, usersCountNorm);
  const amountCents = await calculateInvoiceAmount(planId, billingInterval, usersCountNorm);

  const billing = await findReusableSaasPlanCheckoutInvoice({
    tenantId,
    planId,
    billingInterval,
    usersCount: usersCountNorm,
    billingReason: 'plan_purchase',
  });
  if (!billing) return null;

  const config = await getActiveConfig('saas');
  const gatewayKey = config?.gateway_key ?? 'asaas';
  const gateway = await getActiveGateway({ billingType: 'saas', tenantId });
  if (!gateway) return null;

  const pm = (billing.payment_method ?? 'BOLETO') as PaymentMethod;
  const resolved = await resolveSaasPlanCheckoutPaymentIfEligible(billing, pm, gateway, gatewayKey);
  if (!resolved) return null;

  const b = resolved.billing;
  const u = resolved.paymentUrls;
  let inline_pay_token: string | undefined;
  try {
    inline_pay_token = await ensureTenantBillingInlinePayToken(b.id);
  } catch {
    /* ignore */
  }
  return {
    billing_id: b.id,
    invoice_number: b.invoice_number,
    amount_cents: b.amount_cents,
    status: b.status,
    tenant_id: tenantId,
    payment_method: b.payment_method ?? undefined,
    invoice_url: u?.invoiceUrl,
    bank_slip_url: u?.bankSlipUrl,
    bank_slip_digitable_line: u?.bankSlipDigitableLine,
    pix_qr_code: u?.pixQrCode,
    pix_copy_paste: u?.pixCopyPaste,
    inline_pay_token,
  };
}

const COMMERCIAL_SAAS_BILLING_REASONS = new Set([
  'plan_purchase',
  'plan_upgrade',
  'plan_renewal',
  'manual_charge',
  'seat_addon',
]);

const CHECKOUT_PRESENTABLE_BILLING_STATUSES = ['pending', 'waiting_payment', 'processing'] as const;

/**
 * Reapresenta no checkout uma linha específica de tenant_billing (cobrança pai), se reutilizável no gateway.
 */
export async function getSaasBillingCheckoutPresentation(
  tenantId: string,
  billingId: string
): Promise<PlanCheckoutPendingPayload | null> {
  const billing = await getInvoiceById(billingId);
  if (!billing || billing.tenant_id !== tenantId) return null;

  const reason = billing.billing_reason ?? 'plan_purchase';
  if (!COMMERCIAL_SAAS_BILLING_REASONS.has(reason)) return null;

  if (!CHECKOUT_PRESENTABLE_BILLING_STATUSES.includes(billing.status as (typeof CHECKOUT_PRESENTABLE_BILLING_STATUSES)[number])) {
    return null;
  }

  const config = await getActiveConfig('saas');
  const gatewayKey = config?.gateway_key ?? 'asaas';
  const gateway = await getActiveGateway({ billingType: 'saas', tenantId });
  if (!gateway) return null;

  const methodsToTry: PaymentMethod[] = [];
  const primary = (billing.payment_method ?? 'PIX') as PaymentMethod;
  methodsToTry.push(primary);
  for (const m of ['PIX', 'BOLETO', 'CREDIT_CARD'] as PaymentMethod[]) {
    if (normPaymentMethod(m) !== normPaymentMethod(primary)) methodsToTry.push(m);
  }

  let resolved: { billing: TenantBillingRow; paymentUrls: NonNullable<SubscribePlanResult['paymentUrls']> } | null =
    null;
  for (const pm of methodsToTry) {
    resolved = await resolveSaasPlanCheckoutPaymentIfEligible(billing, pm, gateway, gatewayKey);
    if (resolved) break;
  }
  if (!resolved) return null;

  const b = resolved.billing;
  const u = resolved.paymentUrls;
  let inline_pay_token: string | undefined;
  try {
    inline_pay_token = await ensureTenantBillingInlinePayToken(b.id);
  } catch {
    /* ignore */
  }
  return {
    billing_id: b.id,
    invoice_number: b.invoice_number,
    amount_cents: b.amount_cents,
    status: b.status,
    tenant_id: tenantId,
    payment_method: b.payment_method ?? undefined,
    invoice_url: u?.invoiceUrl,
    bank_slip_url: u?.bankSlipUrl,
    bank_slip_digitable_line: u?.bankSlipDigitableLine,
    pix_qr_code: u?.pixQrCode,
    pix_copy_paste: u?.pixCopyPaste,
    inline_pay_token,
  };
}

/**
 * Cria fatura para assinatura do plano (Fase 3: sem gateway; Fase 4: com gateway e paymentUrls).
 * Valida plano, calcula valor, cria invoice. Se gateway disponível, chama ensureCustomer, createCharge,
 * persiste gateway_reference_id e retorna paymentUrls.
 */
export async function subscribePlan(
  tenantId: string,
  planId: string,
  billingInterval: BillingInterval,
  options?: {
    usersCount?: number | null;
    source?: 'superadmin' | 'self_service' | 'api';
    billingReason?: 'plan_purchase' | 'plan_upgrade' | 'plan_renewal' | 'manual_charge' | 'seat_addon';
    paymentMethod?: PaymentMethod;
  }
): Promise<SubscribePlanResult> {
  await validatePlanForPurchase(planId, options?.usersCount ?? null);
  const amountCents = await calculateInvoiceAmount(planId, billingInterval, options?.usersCount ?? null);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const config = await getActiveConfig('saas');
  const gatewayKey = config?.gateway_key ?? 'asaas';
  const paymentMethod = options?.paymentMethod ?? 'BOLETO';
  const usersCountNorm = options?.usersCount ?? null;
  const billingReason: BillingReason = options?.billingReason ?? 'plan_purchase';

  const invoiceData: CreateInvoiceInput = {
    tenant_id: tenantId,
    plan_id: planId,
    billing_interval: billingInterval,
    amount_cents: amountCents,
    due_date: dueDate,
    source: options?.source ?? 'self_service',
    billing_reason: billingReason,
    users_count: usersCountNorm,
    gateway: gatewayKey,
  };

  const gateway = await getActiveGateway({ billingType: 'saas', tenantId });

  if (!gateway) {
    const billing = await createInvoice(invoiceData);
    return { billing };
  }

  let reusable = await findReusableSaasPlanCheckoutInvoice({
    tenantId,
    planId,
    billingInterval,
    usersCount: usersCountNorm,
    billingReason,
  });
  if (reusable && reusable.amount_cents !== amountCents) {
    await pool.query(
      `UPDATE tenant_billing SET amount_cents = $1, updated_at = now() WHERE id = $2`,
      [amountCents, reusable.id]
    );
    const updated = await getInvoiceById(reusable.id);
    reusable = updated ?? reusable;
  }

  let billing: TenantBillingRow;
  if (reusable) {
    billing = reusable;
  } else {
    await cancelOpenPlanPurchaseBillingsForContext({
      tenantId,
      planId,
      billingInterval,
      usersCount: usersCountNorm,
      billingReason,
    });
    billing = await createInvoice(invoiceData);
  }

  if (!billing.invoice_number) {
    throw new Error('Fatura sem número — não é possível criar cobrança no gateway.');
  }

  try {
    /** Tentativas por método: reuso não precisa de ensureCustomer (evita Asaas antes de decidir reuso). */
    if (await hasTenantBillingPaymentAttemptsTable()) {
      const ensured = await ensureSaasPlanCheckoutPaymentAttemptForSwitch({
        billing,
        tenantId,
        requestedMethod: paymentMethod,
        gateway,
        gatewayKey,
        amountCents,
        dueDateStr,
        invoiceNumber: billing.invoice_number ?? '',
      });
      return { billing: ensured.billing, paymentUrls: ensured.paymentUrls };
    }

    const sameMethodReuse = await resolveSaasPlanCheckoutPaymentIfEligible(
      billing,
      paymentMethod,
      gateway,
      gatewayKey
    );
    if (sameMethodReuse) {
      const refreshed = await getInvoiceById(billing.id);
      return {
        billing: refreshed ?? sameMethodReuse.billing,
        paymentUrls: sameMethodReuse.paymentUrls,
      };
    }

    const customerId = await gateway.ensureCustomer?.(tenantId);
    if (!customerId) throw new Error('ensureCustomer não retornou customerId');

    if (
      billing.gateway_reference_id &&
      billing.payment_method &&
      normPaymentMethod(billing.payment_method) !== normPaymentMethod(paymentMethod) &&
      typeof gateway.cancelPayment === 'function'
    ) {
      try {
        await gateway.cancelPayment(billing.gateway_reference_id);
      } catch (e) {
        console.warn('[subscriptionService] cancelPayment anterior ao trocar método', e);
      }
    }

    const idempotencyKeyForCharge = buildSaasCheckoutChargeIdempotencyKey(billing.id, paymentMethod);

    const chargePayload = {
      customerId,
      amountCents,
      dueDate: dueDateStr,
      paymentMethod,
      description: billing.invoice_number,
      idempotencyKey: idempotencyKeyForCharge,
      externalReference: tenantId,
    };
    console.log('[DIAG subscriptionService]', {
      reusedBilling: Boolean(reusable),
      paymentMethod,
      invoice_number: billing.invoice_number,
      idempotencyKey: idempotencyKeyForCharge,
    });

    const chargeResult = await gateway.createCharge(chargePayload);

    const gatewayMetadata = {
      invoiceUrl: chargeResult.invoiceUrl,
      bankSlipUrl: chargeResult.bankSlipUrl,
      bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
      pixQrCode: chargeResult.pixQrCode,
      pixCopyPaste: chargeResult.pixCopyPaste,
    };

    await updateInvoiceGatewayData(billing.id, {
      gateway: gatewayKey,
      payment_method: paymentMethod,
      gateway_reference_id: chargeResult.paymentId,
      gateway_status: chargeResult.status,
      idempotency_key: idempotencyKeyForCharge,
      gateway_metadata: gatewayMetadata,
    });

    const updatedBilling = await getInvoiceById(billing.id);
    return {
      billing: updatedBilling ?? billing,
      paymentUrls: {
        invoiceUrl: chargeResult.invoiceUrl,
        bankSlipUrl: chargeResult.bankSlipUrl,
        bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
        pixQrCode: chargeResult.pixQrCode,
        pixCopyPaste: chargeResult.pixCopyPaste,
      },
    };
  } catch (err) {
    console.error('[subscriptionService] gateway createCharge error:', err);
    throw mapAsaasChargeError(err);
  }
}

/**
 * Checkout de assentos adicionais (custom): fatura `seat_addon` com valor pró-rata já calculado.
 * Uma cobrança em aberto por contexto; reuso quando mesmo total pretendido.
 */
export async function subscribeSeatAddon(params: {
  tenantId: string;
  planId: string;
  billingInterval: BillingInterval;
  newTotalUsersCount: number;
  amountCents: number;
  seatAddonBreakdown: Record<string, unknown>;
  paymentMethod?: PaymentMethod;
  source?: 'superadmin' | 'self_service' | 'api';
}): Promise<SubscribePlanResult> {
  const {
    tenantId,
    planId,
    billingInterval,
    newTotalUsersCount,
    amountCents,
    seatAddonBreakdown,
    paymentMethod = 'BOLETO',
    source = 'self_service',
  } = params;

  await validatePlanForPurchase(planId, newTotalUsersCount);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const config = await getActiveConfig('saas');
  const gatewayKey = config?.gateway_key ?? 'asaas';

  let billing = await findReusableSaasPlanCheckoutInvoice({
    tenantId,
    planId,
    billingInterval,
    usersCount: newTotalUsersCount,
    billingReason: 'seat_addon',
  });
  await cancelOpenSeatAddonBillingsExcept(tenantId, billing?.id ?? null);

  if (billing && billing.amount_cents !== amountCents) {
    await pool.query(`UPDATE tenant_billing SET amount_cents = $1, updated_at = now() WHERE id = $2`, [
      amountCents,
      billing.id,
    ]);
    const updated = await getInvoiceById(billing.id);
    billing = updated ?? billing;
  }

  if (!billing) {
    billing = await createInvoice({
      tenant_id: tenantId,
      plan_id: planId,
      billing_interval: billingInterval,
      amount_cents: amountCents,
      due_date: dueDate,
      source,
      billing_reason: 'seat_addon',
      users_count: newTotalUsersCount,
      gateway: gatewayKey,
    });
  }

  await pool.query(
    `UPDATE tenants SET seat_addon_pending_billing_id = $1, updated_at = now() WHERE id = $2`,
    [billing.id, tenantId]
  );

  await pool.query(
    `UPDATE tenant_billing
     SET gateway_metadata = COALESCE(gateway_metadata, '{}'::jsonb) || $1::jsonb, updated_at = now()
     WHERE id = $2`,
    [JSON.stringify({ seat_addon_breakdown: seatAddonBreakdown }), billing.id]
  );
  billing = (await getInvoiceById(billing.id)) ?? billing;

  const gateway = await getActiveGateway({ billingType: 'saas', tenantId });
  if (!gateway) {
    return { billing };
  }

  if (!billing.invoice_number) {
    throw new Error('Fatura sem número — não é possível criar cobrança no gateway.');
  }

  try {
    if (await hasTenantBillingPaymentAttemptsTable()) {
      const ensured = await ensureSaasPlanCheckoutPaymentAttemptForSwitch({
        billing,
        tenantId,
        requestedMethod: paymentMethod,
        gateway,
        gatewayKey,
        amountCents,
        dueDateStr,
        invoiceNumber: billing.invoice_number ?? '',
      });
      return { billing: ensured.billing, paymentUrls: ensured.paymentUrls };
    }

    const sameMethodReuse = await resolveSaasPlanCheckoutPaymentIfEligible(
      billing,
      paymentMethod,
      gateway,
      gatewayKey
    );
    if (sameMethodReuse) {
      const refreshed = await getInvoiceById(billing.id);
      return {
        billing: refreshed ?? sameMethodReuse.billing,
        paymentUrls: sameMethodReuse.paymentUrls,
      };
    }

    const customerId = await gateway.ensureCustomer?.(tenantId);
    if (!customerId) throw new Error('ensureCustomer não retornou customerId');

    if (
      billing.gateway_reference_id &&
      billing.payment_method &&
      normPaymentMethod(billing.payment_method) !== normPaymentMethod(paymentMethod) &&
      typeof gateway.cancelPayment === 'function'
    ) {
      try {
        await gateway.cancelPayment(billing.gateway_reference_id);
      } catch (e) {
        console.warn('[subscriptionService] cancelPayment anterior ao trocar método (seat_addon)', e);
      }
    }

    const idempotencyKeyForCharge = buildSaasCheckoutChargeIdempotencyKey(billing.id, paymentMethod);
    const chargeResult = await gateway.createCharge({
      customerId,
      amountCents,
      dueDate: dueDateStr,
      paymentMethod,
      description: billing.invoice_number ?? 'Assentos adicionais',
      idempotencyKey: idempotencyKeyForCharge,
      externalReference: tenantId,
    });

    const gatewayMetadata = {
      invoiceUrl: chargeResult.invoiceUrl,
      bankSlipUrl: chargeResult.bankSlipUrl,
      bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
      pixQrCode: chargeResult.pixQrCode,
      pixCopyPaste: chargeResult.pixCopyPaste,
    };

    await updateInvoiceGatewayData(billing.id, {
      gateway: gatewayKey,
      payment_method: paymentMethod,
      gateway_reference_id: chargeResult.paymentId,
      gateway_status: chargeResult.status,
      idempotency_key: idempotencyKeyForCharge,
      gateway_metadata: gatewayMetadata,
    });

    const updatedBilling = await getInvoiceById(billing.id);
    return {
      billing: updatedBilling ?? billing,
      paymentUrls: {
        invoiceUrl: chargeResult.invoiceUrl,
        bankSlipUrl: chargeResult.bankSlipUrl,
        bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
        pixQrCode: chargeResult.pixQrCode,
        pixCopyPaste: chargeResult.pixCopyPaste,
      },
    };
  } catch (err) {
    console.error('[subscriptionService] subscribeSeatAddon gateway error:', err);
    throw mapAsaasChargeError(err);
  }
}

const DEFAULT_EXPIRE_HOURS = 48;

/**
 * Cancela faturas pendentes criadas há mais de N horas e reverte tenant para trial quando estava payment_pending.
 * Uso: job/cron periódico (ex.: a cada hora). Evita acúmulo de cobranças órfãs.
 */
export async function cancelExpiredPendingBillings(expireAfterHours: number = DEFAULT_EXPIRE_HOURS): Promise<{
  cancelledBillings: number;
  revertedTenants: number;
}> {
  const expired = await pool.query<{ id: string; tenant_id: string }>(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE status = 'pending' AND created_at < now() - ($1 || ' hours')::interval
     RETURNING id, tenant_id`,
    [String(expireAfterHours)]
  );

  const cancelledBillings = expired.rows.length;
  if (cancelledBillings === 0) {
    return { cancelledBillings: 0, revertedTenants: 0 };
  }

  const tenantIds = [...new Set(expired.rows.map((r) => r.tenant_id))];
  const reverted = isPhase2TrialCrmGateEnabled()
    ? await pool.query(
        `UPDATE tenants
         SET status = CASE WHEN has_used_trial THEN 'suspended' ELSE 'trial' END,
             suspension_reason = CASE WHEN has_used_trial THEN 'trial_expired' ELSE NULL END,
             suspended_at = CASE WHEN has_used_trial THEN COALESCE(suspended_at, now()) ELSE NULL END,
             updated_at = now()
         WHERE id = ANY($1::uuid[]) AND status = 'payment_pending'
         RETURNING id`,
        [tenantIds]
      )
    : await pool.query(
        `UPDATE tenants
         SET status = 'trial', updated_at = now()
         WHERE id = ANY($1::uuid[]) AND status = 'payment_pending'
         RETURNING id`,
        [tenantIds]
      );

  return { cancelledBillings, revertedTenants: reverted.rows.length };
}

/**
 * Job idempotente: trial vencido sem pagamento → suspended + trial_expired.
 * Respeita feature flag TRIAL_EXPIRATION_JOB.
 */
export async function expireTrialsPastDue(): Promise<{ suspended: number }> {
  if (!isTrialExpirationJobEnabled()) {
    return { suspended: 0 };
  }
  const r = await pool.query<{ id: string }>(
    `UPDATE tenants
     SET status = 'suspended',
         suspension_reason = 'trial_expired',
         suspended_at = COALESCE(suspended_at, now()),
         has_used_trial = true,
         trial_consumed_at = COALESCE(trial_consumed_at, now()),
         updated_at = now()
     WHERE trial_ends_at IS NOT NULL
       AND trial_ends_at <= now()
       AND activated_billing_id IS NULL
       AND status IN ('trial', 'payment_pending')
     RETURNING id`
  );
  return { suspended: r.rowCount ?? r.rows.length };
}
