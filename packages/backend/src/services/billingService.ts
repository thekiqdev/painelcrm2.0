/**
 * Serviço de cálculo e validação de cobrança (planos standard vs custom).
 * Usado por subscriptionService e pelo fluxo de compra de plano.
 */
import { pool } from '../utils/db.js';
import { effectiveCheckoutTrialDays } from '../utils/checkoutTrialPlan.js';

export type BillingInterval = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

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
export async function calculateSeatAddonProrata(
  planId: string,
  billingInterval: BillingInterval,
  additionalSeats: number,
  periodStart: unknown,
  periodEnd: unknown
): Promise<SeatAddonProrataBreakdown> {
  if (additionalSeats < 1) {
    throw new Error('É necessário informar pelo menos 1 novo assento');
  }
  const startIso = periodBoundaryToYmd(periodStart);
  const endIso = periodBoundaryToYmd(periodEnd);
  const priceRow = await pool.query<{ price_per_user_cents: number }>(
    'SELECT price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1 AND billing_interval = $2',
    [planId, billingInterval]
  );
  if (priceRow.rows.length === 0) {
    throw new Error(`Plano sem preço por usuário para o intervalo "${billingInterval}"`);
  }
  const pricePerUser = priceRow.rows[0].price_per_user_cents;
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
  usersCount?: number | null
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
    return Math.max(0, pricePerUser * count);
  }

  return Math.max(0, plan.price_cents ?? 0);
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
