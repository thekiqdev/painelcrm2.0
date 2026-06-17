/**
 * Serviço de cálculo e validação de cobrança (planos standard vs custom).
 * Usado por subscriptionService e pelo fluxo de compra de plano.
 */
import { resolveTenantCommercialPrice } from '../commercial/tenantCommercialOverrideService.js';
import type { TenantCommercialPriceContext } from '../commercial/tenantCommercialTypes.js';
import { pool } from '../utils/db.js';
import { effectiveCheckoutTrialDays } from '../utils/checkoutTrialPlan.js';

export type CalculateInvoiceAmountOptions = {
  tenantId?: string | null;
  context?: TenantCommercialPriceContext;
};

export type BillingInterval = 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

/** Converte DATE do PG (string YYYY-MM-DD ou Date) para YYYY-MM-DD. */
function periodBoundaryToYmd(value: unknown): string {
  if (value == null) {
    throw new Error('Data de período ausente');
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.length >= 10) return t.slice(0, 10);
    throw new Error('Data de período inválida');
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  throw new Error('Data de período inválida');
}

/**
 * Calcula o valor em centavos da fatura.
 * - standard: plans.price_cents
 * - custom: plan_interval_prices.price_per_user_cents × usersCount
 */
function utcDayMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map((x) => parseInt(x, 10));
  return Date.UTC(y, m - 1, d);
}

/** Dias inclusivos entre duas datas YYYY-MM-DD (UTC). */
export function inclusiveCalendarDaysBetween(startIso: string, endIso: string): number {
  const a = utcDayMs(startIso);
  const b = utcDayMs(endIso);
  const diff = Math.round((b - a) / 86400000);
  return diff + 1;
}

export interface SeatAddonProrataBreakdown {
  formula: 'per_user_price × assentos_novos × (dias_restantes_no_ciclo / dias_totais_do_ciclo)';
  period_start: string;
  period_end: string;
  today: string;
  remaining_window_start: string;
  total_period_days: number;
  remaining_period_days: number;
  price_per_user_full_period_cents: number;
  additional_seats: number;
  amount_cents: number;
}

/**
 * Cobrança incremental de assentos no plano custom: proporcional ao tempo até o fim do período atual da assinatura.
 * Não cobra período cheio antecipado — apenas a fração do ciclo em aberto, por usuário adicional.
 */
/**
 * Valor da linha da assinatura SaaS quando plano e intervalo não mudam (ex.: só assentos),
 * usando snapshot contratado. Custom sem `contracted_price_per_user_cents` → null (usa catálogo).
 */
export function tryResolveSubscriptionLineAmountFromContractSnapshot(
  planType: string,
  usersCount: number | null | undefined,
  contracted_plan_price_cents: number | null | undefined,
  contracted_price_per_user_cents: number | null | undefined
): number | null {
  if (planType === 'custom') {
    const pu = contracted_price_per_user_cents;
    if (pu != null && pu >= 0) {
      const seats = Math.max(1, usersCount ?? 1);
      return Math.max(0, Math.round(pu * seats));
    }
    return null;
  }
  const base = contracted_plan_price_cents;
  if (base != null && base >= 0) {
    return Math.max(0, base);
  }
  return null;
}

export async function calculateSeatAddonProrata(
  planId: string,
  billingInterval: BillingInterval,
  additionalSeats: number,
  periodStart: unknown,
  periodEnd: unknown,
  options?: { contractedPricePerUserCents?: number | null }
): Promise<SeatAddonProrataBreakdown> {
  if (additionalSeats < 1) {
    throw new Error('É necessário informar pelo menos 1 novo assento');
  }
  const startIso = periodBoundaryToYmd(periodStart);
  const endIso = periodBoundaryToYmd(periodEnd);

  let pricePerUser: number;
  const contractedPu = options?.contractedPricePerUserCents;
  if (contractedPu != null && contractedPu >= 0) {
    pricePerUser = contractedPu;
  } else {
    const priceRow = await pool.query<{ price_per_user_cents: number }>(
      'SELECT price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1 AND billing_interval = $2',
      [planId, billingInterval]
    );
    if (priceRow.rows.length === 0) {
      throw new Error(`Plano sem preço por usuário para o intervalo "${billingInterval}"`);
    }
    pricePerUser = priceRow.rows[0].price_per_user_cents;
  }
  const today = new Date().toISOString().slice(0, 10);
  const totalPeriodDays = Math.max(1, inclusiveCalendarDaysBetween(startIso, endIso));
  const windowStart = startIso > today ? startIso : today;
  let remainingDays = 0;
  if (windowStart <= endIso) {
    remainingDays = inclusiveCalendarDaysBetween(windowStart, endIso);
  }
  remainingDays = Math.min(remainingDays, totalPeriodDays);
  if (remainingDays < 1) {
    throw new Error('Não há dias restantes neste ciclo para cobrar assentos adicionais proporcionalmente');
  }
  const ratio = remainingDays / totalPeriodDays;
  const raw = additionalSeats * pricePerUser * ratio;
  const amountCents = Math.max(0, Math.round(raw));
  if (amountCents < 1) {
    throw new Error('Valor calculado para o addon é zero; verifique o período e a quantidade');
  }
  return {
    formula: 'per_user_price × assentos_novos × (dias_restantes_no_ciclo / dias_totais_do_ciclo)',
    period_start: startIso,
    period_end: endIso,
    today,
    remaining_window_start: windowStart,
    total_period_days: totalPeriodDays,
    remaining_period_days: remainingDays,
    price_per_user_full_period_cents: pricePerUser,
    additional_seats: additionalSeats,
    amount_cents: amountCents,
  };
}

export async function calculateInvoiceAmount(
  planId: string,
  billingInterval: BillingInterval,
  usersCount?: number | null,
  options?: CalculateInvoiceAmountOptions,
): Promise<number> {
  const planRow = await pool.query<{ plan_type: string; price_cents: number | null }>(
    'SELECT plan_type, price_cents FROM plans WHERE id = $1 AND is_active = true',
    [planId]
  );
  if (planRow.rows.length === 0) {
    throw new Error('Plano não encontrado ou inativo');
  }
  const plan = planRow.rows[0];
  const planType = plan.plan_type ?? 'standard';

  let catalogAmount: number;
  if (planType === 'custom') {
    const count = usersCount != null && usersCount > 0 ? usersCount : 1;
    const priceRow = await pool.query<{ price_per_user_cents: number }>(
      'SELECT price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1 AND billing_interval = $2',
      [planId, billingInterval]
    );
    if (priceRow.rows.length === 0) {
      throw new Error(
        `Plano personalizado sem preço para o intervalo "${billingInterval}". Defina plan_interval_prices para este plano.`
      );
    }
    const pricePerUser = priceRow.rows[0].price_per_user_cents;
    catalogAmount = Math.max(0, pricePerUser * count);
  } else {
    catalogAmount = Math.max(0, plan.price_cents ?? 0);
  }

  const tenantId = options?.tenantId?.trim();
  if (!tenantId) {
    return catalogAmount;
  }

  const resolved = await resolveTenantCommercialPrice({
    tenantId,
    planId,
    billingInterval,
    catalogAmountCents: catalogAmount,
    context: options?.context ?? 'checkout',
  });
  return resolved.finalAmountCents;
}

/** Origem do valor na renovação SaaS (Etapa 2 — snapshot vs catálogo). */
export type SaasRenewalPriceSource = 'contracted_snapshot' | 'catalog_fallback';

/**
 * Tenta obter o valor da renovação apenas a partir do snapshot em `subscriptions`.
 * Retorna `null` quando deve usar {@link calculateInvoiceAmount} (preço público atual).
 *
 * Regras:
 * - **standard:** `contracted_plan_price_cents`
 * - **custom:** `contracted_price_per_user_cents × usersForRenewal` (mín. 1 assento)
 * - **custom** sem unitário: fallback seguro para `contracted_plan_price_cents` (total fixo no snapshot)
 */
export function tryResolveSaasRenewalAmountFromContractSnapshot(
  planType: string,
  usersForRenewal: number | null,
  contracted_plan_price_cents: number | null | undefined,
  contracted_price_per_user_cents: number | null | undefined
): { amountCents: number; planPriceSnapshotForInvoice: number } | null {
  const seats = Math.max(1, usersForRenewal ?? 1);
  const isCustom = planType === 'custom';

  if (isCustom) {
    const pu = contracted_price_per_user_cents;
    if (pu != null && pu >= 0) {
      const total = Math.max(0, Math.round(pu * seats));
      return { amountCents: total, planPriceSnapshotForInvoice: total };
    }
    const totalFixed = contracted_plan_price_cents;
    if (totalFixed != null && totalFixed >= 0) {
      const v = Math.max(0, totalFixed);
      /* Fallback quando só existe total no snapshot (ex.: backfill sem divisão por assento). */
      return { amountCents: v, planPriceSnapshotForInvoice: v };
    }
    return null;
  }

  const base = contracted_plan_price_cents;
  if (base != null && base >= 0) {
    const v = Math.max(0, base);
    return { amountCents: v, planPriceSnapshotForInvoice: v };
  }
  return null;
}

export interface CalculateSaasRenewalInvoiceAmountParams {
  planId: string;
  billingInterval: BillingInterval;
  planType: string;
  /** `plans.price_cents` — usado só em metadata da fatura no fallback catálogo (standard). */
  planListPriceCents: number | null;
  usersForRenewal: number | null;
  contracted_plan_price_cents?: number | null;
  contracted_price_per_user_cents?: number | null;
  /** Quando informado, aplica override comercial na renovação. */
  tenantId?: string | null;
}

/**
 * Valor da fatura de **renovação SaaS** apenas: usa snapshot contratado quando disponível;
 * caso contrário mantém o comportamento do catálogo (`calculateInvoiceAmount`).
 * Não altera checkout nem primeira contratação.
 */
export async function calculateSaasRenewalInvoiceAmount(
  params: CalculateSaasRenewalInvoiceAmountParams
): Promise<{
  amountCents: number;
  priceSource: SaasRenewalPriceSource;
  planPriceSnapshotForInvoice: number;
}> {
  const snap = tryResolveSaasRenewalAmountFromContractSnapshot(
    params.planType,
    params.usersForRenewal,
    params.contracted_plan_price_cents,
    params.contracted_price_per_user_cents
  );
  if (snap) {
    let amountCents = snap.amountCents;
    const tenantId = params.tenantId?.trim();
    if (tenantId) {
      const resolved = await resolveTenantCommercialPrice({
        tenantId,
        planId: params.planId,
        billingInterval: params.billingInterval,
        catalogAmountCents: amountCents,
        context: 'renewal',
      });
      amountCents = resolved.finalAmountCents;
    }
    return {
      amountCents,
      priceSource: 'contracted_snapshot',
      planPriceSnapshotForInvoice: snap.planPriceSnapshotForInvoice,
    };
  }

  const amountCents = await calculateInvoiceAmount(
    params.planId,
    params.billingInterval,
    params.usersForRenewal,
    params.tenantId
      ? { tenantId: params.tenantId, context: 'renewal' }
      : undefined,
  );
  const planPriceSnapshotForInvoice =
    params.planType === 'custom'
      ? amountCents
      : params.planListPriceCents ?? amountCents;

  return {
    amountCents,
    priceSource: 'catalog_fallback',
    planPriceSnapshotForInvoice,
  };
}

/**
 * Valida se o plano pode ser contratado (existe, ativo, e se custom exige users_count).
 */
export async function validatePlanForPurchase(
  planId: string,
  usersCount?: number | null
): Promise<void> {
  const planRow = await pool.query<{
    plan_type: string;
    is_free: boolean;
    trial_days: number | null;
    free_access_days: number | null;
  }>(
    'SELECT plan_type, is_free, trial_days, free_access_days FROM plans WHERE id = $1 AND is_active = true',
    [planId]
  );
  if (planRow.rows.length === 0) {
    throw new Error('Plano não encontrado ou inativo');
  }
  const plan = planRow.rows[0];
  const planType = plan.plan_type ?? 'standard';

  if (planType === 'custom') {
    if (usersCount == null || usersCount < 1) {
      throw new Error('Planos personalizados exigem users_count >= 1');
    }
  }

  const trialDaysEffective = effectiveCheckoutTrialDays(plan);
  /** Gratuito permanente (sem período de trial de checkout / conversão paga). */
  if (plan.is_free === true && trialDaysEffective < 1) {
    throw new Error('Plano gratuito não utiliza fluxo de compra com cobrança');
  }
}
