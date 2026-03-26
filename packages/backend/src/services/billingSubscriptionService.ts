/**
 * Billing Engine: criação e atualização de assinaturas (subscriptions).
 * Usado após activatePlanFromBilling (criar assinatura saas) e pelo worker (atualizar após renovação).
 */
import { pool } from '../utils/db.js';

export type SubscriptionType = 'saas' | 'customer';
export type BillingInterval = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

export interface SubscriptionRow {
  id: string;
  type: string;
  tenant_id: string;
  customer_id: string | null;
  plan_id: string | null;
  amount_cents: number;
  currency: string;
  billing_anchor_day: number | null;
  billing_cycle_count: number;
  billing_interval: string;
  status: string;
  next_billing_date: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_period_days: number;
  default_payment_method: string | null;
  users_count: number | null;
  gateway: string | null;
  last_job_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSubscriptionInput {
  type: SubscriptionType;
  tenant_id: string;
  customer_id?: string | null;
  plan_id: string | null;
  amount_cents: number;
  billing_interval: BillingInterval;
  next_billing_date: string; // YYYY-MM-DD
  current_period_start: string;
  current_period_end: string;
  billing_anchor_day?: number | null; // 1-31, dia do mês para cobrança fixa
  grace_period_days?: number;
  users_count?: number | null;
  gateway?: string | null;
  created_by?: string | null; // checkout | admin | api | migration
  default_payment_method?: string | null; // PIX | BOLETO | CREDIT_CARD (para type=customer)
}

/**
 * Cria assinatura (saas após primeiro pagamento; customer no futuro).
 */
export async function createSubscription(data: CreateSubscriptionInput): Promise<SubscriptionRow> {
  const r = await pool.query<SubscriptionRow>(
    `INSERT INTO subscriptions (
      type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
      billing_cycle_count, billing_interval, status, next_billing_date,
      current_period_start, current_period_end, grace_period_days, default_payment_method, users_count, gateway, created_by
    ) VALUES ($1, $2, $3, $4, $5, 'BRL', $6, 0, $7, 'active', $8, $9, $10, COALESCE($11, 3), $12, $13, $14, $15)
    RETURNING id, type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
      billing_cycle_count, billing_interval, status, next_billing_date, current_period_start, current_period_end,
      cancel_at_period_end, grace_period_days, default_payment_method, users_count, gateway, last_job_at, created_by, created_at, updated_at`,
    [
      data.type,
      data.tenant_id,
      data.customer_id ?? null,
      data.plan_id,
      data.amount_cents,
      data.billing_anchor_day ?? null,
      data.billing_interval,
      data.next_billing_date,
      data.current_period_start,
      data.current_period_end,
      data.grace_period_days ?? 3,
      data.default_payment_method ?? null,
      data.users_count ?? null,
      data.gateway ?? null,
      data.created_by ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * Retorna a assinatura ativa do tipo saas para o tenant (no máximo uma).
 */
export async function getActiveSaasSubscriptionByTenant(
  tenantId: string
): Promise<SubscriptionRow | null> {
  const r = await pool.query<SubscriptionRow>(
    `SELECT id, type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
       billing_cycle_count, billing_interval, status, next_billing_date, current_period_start, current_period_end,
       cancel_at_period_end, grace_period_days, default_payment_method, users_count, gateway, last_job_at, created_by, created_at, updated_at
     FROM subscriptions
     WHERE type = 'saas' AND tenant_id = $1 AND status = 'active'
     LIMIT 1`,
    [tenantId]
  );
  return r.rows[0] ?? null;
}

/**
 * Busca assinatura por id (para o worker).
 */
export async function getSubscriptionById(subscriptionId: string): Promise<SubscriptionRow | null> {
  const r = await pool.query<SubscriptionRow>(
    `SELECT id, type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
       billing_cycle_count, billing_interval, status, next_billing_date, current_period_start, current_period_end,
       cancel_at_period_end, grace_period_days, default_payment_method, users_count, gateway, last_job_at, created_by, created_at, updated_at
     FROM subscriptions WHERE id = $1`,
    [subscriptionId]
  );
  return r.rows[0] ?? null;
}

/**
 * Atualiza assinatura após renovação: próximo período, cycle_count, last_job_at.
 */
export async function updateSubscriptionAfterRenewal(
  subscriptionId: string,
  data: {
    next_billing_date: string;
    current_period_start: string;
    current_period_end: string;
    billing_cycle_count: number;
  }
): Promise<void> {
  await pool.query(
    `UPDATE subscriptions
     SET next_billing_date = $1, current_period_start = $2, current_period_end = $3,
         billing_cycle_count = $4, last_job_at = now(), updated_at = now()
     WHERE id = $5`,
    [
      data.next_billing_date,
      data.current_period_start,
      data.current_period_end,
      data.billing_cycle_count,
      subscriptionId,
    ]
  );
}

/**
 * Cancela assinatura (Fase 2).
 * - immediate: true → status = cancelled, cancelled_at = now(), tenant volta para trial e plan_period_end = hoje.
 * - immediate: false → cancel_at_period_end = true (scheduler não gera novo job após current_period_end; ao fim vira cancelled).
 */
export async function cancelSubscription(
  subscriptionId: string,
  tenantId: string,
  options: { immediate: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub || sub.tenant_id !== tenantId) {
    return { ok: false, error: 'Assinatura não encontrada ou não pertence a esta conta' };
  }
  if (sub.status !== 'active') {
    return { ok: false, error: 'Assinatura já está cancelada ou inativa' };
  }

  if (options.immediate) {
    await pool.query(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [subscriptionId, tenantId]
    );
    await pool.query(
      `UPDATE tenants SET status = 'trial', plan_period_end = CURRENT_DATE, updated_at = now() WHERE id = $1`,
      [tenantId]
    );
  } else {
    await pool.query(
      `UPDATE subscriptions SET cancel_at_period_end = true, updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [subscriptionId, tenantId]
    );
  }
  return { ok: true };
}

/**
 * Marca como cancelled as assinaturas com cancel_at_period_end = true e current_period_end < hoje.
 * Chamar no scheduler ou em cron diário.
 */
export async function expireCancelledSubscriptions(): Promise<number> {
  const r = await pool.query(
    `UPDATE subscriptions
     SET status = 'cancelled', cancelled_at = now(), updated_at = now()
     WHERE cancel_at_period_end = true AND current_period_end < CURRENT_DATE AND status = 'active'
     RETURNING id`
  );
  for (const row of r.rows) {
    const sub = await getSubscriptionById(row.id);
    if (sub) {
      await pool.query(
        `UPDATE tenants SET status = 'trial', plan_period_end = CURRENT_DATE, updated_at = now() WHERE id = $1`,
        [sub.tenant_id]
      );
    }
  }
  return r.rows.length;
}

/**
 * Altera plano da assinatura (upgrade/downgrade). Próxima cobrança usará o novo plano; sem cobrança imediata na Fase 2.
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  tenantId: string,
  data: { plan_id: string; billing_interval?: BillingInterval; users_count?: number | null }
): Promise<{ ok: boolean; error?: string }> {
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub || sub.tenant_id !== tenantId) {
    return { ok: false, error: 'Assinatura não encontrada ou não pertence a esta conta' };
  }
  if (sub.status !== 'active') {
    return { ok: false, error: 'Assinatura não está ativa' };
  }

  const { calculateInvoiceAmount } = await import('./billingService.js');
  const { validatePlanForPurchase } = await import('./billingService.js');
  await validatePlanForPurchase(data.plan_id, data.users_count ?? null);
  const amountCents = await calculateInvoiceAmount(
    data.plan_id,
    (data.billing_interval ?? sub.billing_interval) as BillingInterval,
    data.users_count ?? sub.users_count ?? null
  );

  const interval = data.billing_interval ?? sub.billing_interval;
  await pool.query(
    `UPDATE subscriptions
     SET plan_id = $1, amount_cents = $2, billing_interval = $3, users_count = COALESCE($4, users_count), updated_at = now()
     WHERE id = $5 AND tenant_id = $6`,
    [data.plan_id, amountCents, interval, data.users_count ?? null, subscriptionId, tenantId]
  );
  return { ok: true };
}
