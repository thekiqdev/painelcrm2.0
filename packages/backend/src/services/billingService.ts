/**
 * Serviço de cálculo e validação de cobrança (planos standard vs custom).
 * Usado por subscriptionService e pelo fluxo de compra de plano.
 */
import { pool } from '../utils/db.js';

export type BillingInterval = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

/**
 * Calcula o valor em centavos da fatura.
 * - standard: plans.price_cents
 * - custom: plan_interval_prices.price_per_user_cents × usersCount
 */
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
  const planRow = await pool.query<{ plan_type: string; is_free: boolean }>(
    'SELECT plan_type, is_free FROM plans WHERE id = $1 AND is_active = true',
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

  if (plan.is_free) {
    throw new Error('Plano gratuito não utiliza fluxo de compra com cobrança');
  }
}
