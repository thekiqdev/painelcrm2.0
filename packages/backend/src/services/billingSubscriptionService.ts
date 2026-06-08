/**
 * Billing Engine: criação e atualização de assinaturas (subscriptions).
 * Usado após activatePlanFromBilling (criar assinatura saas) e pelo worker (atualizar após renovação).
 */
import { pool } from '../utils/db.js';
import { yyyyMmDdFromDbDateValue } from '../utils/calendarDateBr.js';
import type { TenantBillingRow } from './invoiceService.js';

export type SubscriptionType = 'saas' | 'customer';
export type BillingInterval = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

type SubscriptionRowDb = Omit<SubscriptionRow, 'cycles_unlimited' | 'max_cycles'> & {
  cycles_unlimited?: boolean;
  max_cycles?: number | null;
};

function mapSubscriptionRow(row: SubscriptionRowDb): SubscriptionRow {
  return {
    ...row,
    cycles_unlimited: row.cycles_unlimited !== false,
    max_cycles: row.max_cycles != null ? Number(row.max_cycles) : null,
  };
}

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
  /** Ciclos ilimitados (default true). Se false, `max_cycles` é obrigatório. */
  cycles_unlimited: boolean;
  max_cycles: number | null;
  /** Etapa 1 snapshot — renovação ainda usa lista pública até Etapa 2. */
  contracted_at?: string | Date | null;
  contracted_billing_interval?: string | null;
  contracted_plan_price_cents?: number | null;
  contracted_price_per_user_cents?: number | null;
  contract_currency?: string | null;
  pricing_snapshot_source?: string | null;
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
  cycles_unlimited?: boolean;
  max_cycles?: number | null;
}

/**
 * Cria assinatura (saas após primeiro pagamento; customer no futuro).
 */
export async function createSubscription(data: CreateSubscriptionInput): Promise<SubscriptionRow> {
  const unlimited = data.cycles_unlimited !== false;
  const maxCycles = unlimited ? null : data.max_cycles ?? null;
  if (!unlimited && (maxCycles == null || maxCycles < 1)) {
    throw new Error('max_cycles obrigatório e maior que zero quando cycles_unlimited é false');
  }
  const r = await pool.query<SubscriptionRow>(
    `INSERT INTO subscriptions (
      type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
      billing_cycle_count, billing_interval, status, next_billing_date,
      current_period_start, current_period_end, grace_period_days, default_payment_method, users_count, gateway, created_by,
      cycles_unlimited, max_cycles
    ) VALUES ($1, $2, $3, $4, $5, 'BRL', $6, 0, $7, 'active', $8, $9, $10, COALESCE($11, 3), $12, $13, $14, $15, $16, $17)
    RETURNING id, type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
      billing_cycle_count, billing_interval, status, next_billing_date, current_period_start, current_period_end,
      cancel_at_period_end, grace_period_days, default_payment_method, users_count, gateway, last_job_at, created_by, created_at, updated_at,
      cycles_unlimited, max_cycles,
      contracted_at, contracted_billing_interval, contracted_plan_price_cents, contracted_price_per_user_cents,
      contract_currency, pricing_snapshot_source`,
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
      unlimited,
      maxCycles,
    ]
  );
  return mapSubscriptionRow(r.rows[0] as SubscriptionRowDb);
}

/**
 * Retorna a assinatura ativa do tipo saas para o tenant (no máximo uma).
 */
export async function getActiveSaasSubscriptionByTenant(
  tenantId: string
): Promise<SubscriptionRow | null> {
  const r = await pool.query<SubscriptionRowDb>(
    `SELECT id, type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
       billing_cycle_count, billing_interval, status, next_billing_date, current_period_start, current_period_end,
       cancel_at_period_end, grace_period_days, default_payment_method, users_count, gateway, last_job_at, created_by, created_at, updated_at,
       cycles_unlimited, max_cycles,
       contracted_at, contracted_billing_interval, contracted_plan_price_cents, contracted_price_per_user_cents,
       contract_currency, pricing_snapshot_source
     FROM subscriptions
     WHERE type = 'saas' AND tenant_id = $1 AND status = 'active'
     LIMIT 1`,
    [tenantId]
  );
  const row = r.rows[0];
  return row ? mapSubscriptionRow(row) : null;
}

/** Normaliza DATE/timestamp do PG (string ou Date) para YYYY-MM-DD (calendário local, não UTC). */
export function toYmd(value: unknown): string | null {
  if (value == null) return null;
  const ymd = yyyyMmDdFromDbDateValue(value as string | Date | null);
  return ymd || null;
}

/**
 * Preenche período corrente e próxima cobrança quando a assinatura SaaS ativa está incompleta (NULL).
 * Não altera linhas que já têm current_period_* — evita sobrescrever renovações do worker.
 */
export async function patchActiveSaasSubscriptionIncompletePeriods(params: {
  tenantId: string;
  subscriptionId: string;
  periodStart: unknown;
  periodEnd: unknown;
  planId: string | null;
  billingInterval: string;
  amountCents: number;
  usersCount: number | null;
}): Promise<boolean> {
  const ps = toYmd(params.periodStart);
  const pe = toYmd(params.periodEnd);
  if (!ps || !pe) return false;
  const dayPart = parseInt(ps.slice(8, 10), 10);
  const anchorDay =
    Number.isFinite(dayPart) && dayPart >= 1 && dayPart <= 31 ? dayPart : null;
  const r = await pool.query(
    `UPDATE subscriptions
     SET current_period_start = $1,
         current_period_end = $2,
         next_billing_date = $2,
         plan_id = COALESCE($5, plan_id),
         billing_interval = $6,
         amount_cents = $7,
         users_count = COALESCE($8, users_count),
         billing_anchor_day = COALESCE(billing_anchor_day, $9::smallint),
         updated_at = now()
     WHERE id = $3 AND tenant_id = $4 AND type = 'saas' AND status = 'active'
       AND (current_period_start IS NULL OR current_period_end IS NULL)
     RETURNING id`,
    [
      ps,
      pe,
      params.subscriptionId,
      params.tenantId,
      params.planId,
      params.billingInterval,
      params.amountCents,
      params.usersCount,
      anchorDay,
    ]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Estima início do ciclo a partir do fim, espelhando a regra de `addInterval` no backend. */
function subtractIntervalFromPeriodEnd(endYmd: string, interval: string): string {
  const d = new Date(`${endYmd}T12:00:00.000Z`);
  switch (interval as BillingInterval) {
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() - 3);
      break;
    case 'semi_annual':
      d.setUTCMonth(d.getUTCMonth() - 6);
      break;
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
    default:
      d.setUTCMonth(d.getUTCMonth() - 1);
  }
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

type ResolvedSaasCycle = {
  periodStart: string;
  periodEnd: string;
  planId: string | null;
  billingInterval: string;
  amountCents: number;
  usersCount: number | null;
};

/**
 * Para assinatura SaaS ativa com período incompleto: deriva ciclo na ordem
 * tenant → fatura que ativou o plano → última fatura paga de plano/upgrade/renovação → próximo vencimento na assinatura.
 * Cobertura explícita para contas legadas com `plan_period_*` NULL no tenant.
 */
async function resolveCycleForIncompleteSaasSubscription(
  tenantId: string,
  sub: SubscriptionRow
): Promise<ResolvedSaasCycle | null> {
  const t = await pool.query<{
    plan_period_start: unknown;
    plan_period_end: unknown;
    activated_billing_id: string | null;
    plan_id: string | null;
  }>(
    `SELECT plan_period_start, plan_period_end, activated_billing_id, plan_id
     FROM tenants WHERE id = $1 AND status = 'active'`,
    [tenantId]
  );
  const trow = t.rows[0];
  if (!trow) return null;

  let ps = toYmd(trow.plan_period_start);
  let pe = toYmd(trow.plan_period_end);
  if (ps && pe) {
    return {
      periodStart: ps,
      periodEnd: pe,
      planId: trow.plan_id,
      billingInterval: sub.billing_interval,
      amountCents: sub.amount_cents,
      usersCount: sub.users_count ?? null,
    };
  }

  if (trow.activated_billing_id) {
    const b = await pool.query<{
      period_start: unknown;
      period_end: unknown;
      plan_id: string;
      billing_interval: string;
      amount_cents: number;
      users_count: number | null;
      status: string;
    }>(
      `SELECT period_start, period_end, plan_id, billing_interval, amount_cents, users_count, status
       FROM tenant_billing WHERE id = $1 AND tenant_id = $2`,
      [trow.activated_billing_id, tenantId]
    );
    const br = b.rows[0];
    if (br?.status === 'paid') {
      ps = toYmd(br.period_start);
      pe = toYmd(br.period_end);
      if (ps && pe) {
        return {
          periodStart: ps,
          periodEnd: pe,
          planId: br.plan_id,
          billingInterval: br.billing_interval,
          amountCents: br.amount_cents,
          usersCount: br.users_count ?? null,
        };
      }
    }
  }

  const latest = await pool.query<{
    period_start: unknown;
    period_end: unknown;
    plan_id: string;
    billing_interval: string;
    amount_cents: number;
    users_count: number | null;
  }>(
    `SELECT period_start, period_end, plan_id, billing_interval, amount_cents, users_count
     FROM tenant_billing
     WHERE tenant_id = $1 AND status = 'paid'
       AND period_start IS NOT NULL AND period_end IS NOT NULL
       AND COALESCE(billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade', 'plan_renewal')
     ORDER BY COALESCE(paid_at, updated_at) DESC NULLS LAST
     LIMIT 1`,
    [tenantId]
  );
  const lr = latest.rows[0];
  if (lr) {
    ps = toYmd(lr.period_start);
    pe = toYmd(lr.period_end);
    if (ps && pe) {
      return {
        periodStart: ps,
        periodEnd: pe,
        planId: lr.plan_id,
        billingInterval: lr.billing_interval,
        amountCents: lr.amount_cents,
        usersCount: lr.users_count ?? null,
      };
    }
  }

  const nb = toYmd(sub.next_billing_date);
  if (nb) {
    return {
      periodStart: subtractIntervalFromPeriodEnd(nb, sub.billing_interval),
      periodEnd: nb,
      planId: sub.plan_id,
      billingInterval: sub.billing_interval,
      amountCents: sub.amount_cents,
      usersCount: sub.users_count ?? null,
    };
  }

  return null;
}

async function backfillTenantPlanPeriodIfMissing(
  tenantId: string,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  await pool.query(
    `UPDATE tenants
     SET plan_period_start = COALESCE(plan_period_start, $1::date),
         plan_period_end = COALESCE(plan_period_end, $2::date),
         updated_at = now()
     WHERE id = $3 AND status = 'active'`,
    [periodStart, periodEnd, tenantId]
  );
}

/**
 * Assinatura ativa com `current_period_*` ausente: repara a partir do ciclo da conta (tenant, faturas de plano pagas)
 * ou, em último caso, `next_billing_date` + intervalo. Alinha `tenants.plan_period_*` quando ainda estiverem vazios.
 */
export async function getActiveSaasSubscriptionByTenantAutoRepair(
  tenantId: string
): Promise<SubscriptionRow | null> {
  let sub = await getActiveSaasSubscriptionByTenant(tenantId);
  if (!sub) return null;
  if (sub.current_period_start && sub.current_period_end) return sub;

  const resolved = await resolveCycleForIncompleteSaasSubscription(tenantId, sub);
  if (!resolved) return sub;

  await patchActiveSaasSubscriptionIncompletePeriods({
    tenantId,
    subscriptionId: sub.id,
    periodStart: resolved.periodStart,
    periodEnd: resolved.periodEnd,
    planId: resolved.planId ?? sub.plan_id,
    billingInterval: resolved.billingInterval,
    amountCents: resolved.amountCents,
    usersCount: resolved.usersCount,
  });
  await backfillTenantPlanPeriodIfMissing(tenantId, resolved.periodStart, resolved.periodEnd);

  return (await getActiveSaasSubscriptionByTenant(tenantId)) ?? sub;
}

/**
 * Busca assinatura por id (para o worker).
 */
export async function getSubscriptionById(subscriptionId: string): Promise<SubscriptionRow | null> {
  try {
    const r = await pool.query<SubscriptionRowDb>(
      `SELECT id, type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
       billing_cycle_count, billing_interval, status, next_billing_date, current_period_start, current_period_end,
       cancel_at_period_end, grace_period_days, default_payment_method, users_count, gateway, last_job_at, created_by, created_at, updated_at,
       cycles_unlimited, max_cycles,
       contracted_at, contracted_billing_interval, contracted_plan_price_cents, contracted_price_per_user_cents,
       contract_currency, pricing_snapshot_source
     FROM subscriptions WHERE id = $1`,
      [subscriptionId]
    );
    const row = r.rows[0];
    if (!row) return null;
    const nextYmd = toYmd(row.next_billing_date);
    return {
      ...mapSubscriptionRow(row),
      next_billing_date: nextYmd ?? '',
      current_period_start: toYmd(row.current_period_start),
      current_period_end: toYmd(row.current_period_end),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/cycles_unlimited|max_cycles/.test(msg)) throw e;
    const r = await pool.query<SubscriptionRowDb>(
      `SELECT id, type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
       billing_cycle_count, billing_interval, status, next_billing_date, current_period_start, current_period_end,
       cancel_at_period_end, grace_period_days, default_payment_method, users_count, gateway, last_job_at, created_by, created_at, updated_at,
       contracted_at, contracted_billing_interval, contracted_plan_price_cents, contracted_price_per_user_cents,
       contract_currency, pricing_snapshot_source
     FROM subscriptions WHERE id = $1`,
      [subscriptionId]
    );
    const row = r.rows[0];
    if (!row) return null;
    const nextYmd = toYmd(row.next_billing_date);
    return {
      ...mapSubscriptionRow({ ...row, cycles_unlimited: true, max_cycles: null }),
      next_billing_date: nextYmd ?? '',
      current_period_start: toYmd(row.current_period_start),
      current_period_end: toYmd(row.current_period_end),
    };
  }
}

/**
 * Atualiza configuração de ciclos (assinaturas CRM). Não altera motor de geração.
 */
export async function patchSubscriptionCyclesConfig(params: {
  tenantId: string;
  subscriptionId: string;
  cycles_unlimited: boolean;
  max_cycles: number | null;
}): Promise<SubscriptionRow | null> {
  const unlimited = params.cycles_unlimited;
  const maxCycles = unlimited ? null : params.max_cycles;
  if (!unlimited && (maxCycles == null || maxCycles < 1)) {
    throw new Error('max_cycles obrigatório e maior que zero quando cycles_unlimited é false');
  }
  const r = await pool.query<SubscriptionRowDb>(
    `UPDATE subscriptions
     SET cycles_unlimited = $1, max_cycles = $2, updated_at = now()
     WHERE id = $3 AND tenant_id = $4 AND type = 'customer'
     RETURNING id, type, tenant_id, customer_id, plan_id, amount_cents, currency, billing_anchor_day,
       billing_cycle_count, billing_interval, status, next_billing_date, current_period_start, current_period_end,
       cancel_at_period_end, grace_period_days, default_payment_method, users_count, gateway, last_job_at, created_by, created_at, updated_at,
       cycles_unlimited, max_cycles,
       contracted_at, contracted_billing_interval, contracted_plan_price_cents, contracted_price_per_user_cents,
       contract_currency, pricing_snapshot_source`,
    [unlimited, maxCycles, params.subscriptionId, params.tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const nextYmd = toYmd(row.next_billing_date);
  return {
    ...mapSubscriptionRow(row),
    next_billing_date: nextYmd ?? '',
    current_period_start: toYmd(row.current_period_start),
    current_period_end: toYmd(row.current_period_end),
  };
}

/** Cliente mínimo para UPDATE na assinatura (pool com ALS ou client do worker). */
export type SubscriptionRenewalDb = {
  query: (text: string, values?: unknown[]) => Promise<import('pg').QueryResult>;
};

/**
 * Atualiza assinatura após renovação: próximo período, cycle_count, last_job_at.
 * Exige `tenant_id` no WHERE para RLS e integridade; falha se não atualizar exatamente 1 linha.
 */
export async function updateSubscriptionAfterRenewal(
  db: SubscriptionRenewalDb,
  subscriptionId: string,
  tenantId: string,
  data: {
    next_billing_date: string;
    current_period_start: string;
    current_period_end: string;
    billing_cycle_count: number;
  }
): Promise<void> {
  const r = await db.query(
    `UPDATE subscriptions
     SET next_billing_date = $1::date, current_period_start = $2::date, current_period_end = $3::date,
         billing_cycle_count = $4,
         billing_anchor_day = EXTRACT(DAY FROM $1::date)::int,
         last_job_at = now(), updated_at = now()
     WHERE id = $5 AND tenant_id = $6`,
    [
      data.next_billing_date,
      data.current_period_start,
      data.current_period_end,
      data.billing_cycle_count,
      subscriptionId,
      tenantId,
    ]
  );
  const n = r.rowCount ?? 0;
  if (n !== 1) {
    throw new Error(
      `updateSubscriptionAfterRenewal: esperava 1 linha atualizada, obteve ${n} (subscription_id=${subscriptionId} tenant_id=${tenantId})`
    );
  }
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
    // lifecycle shadow observation
    const { observeBillingLifecycleEventWithKanbanActual } = await import('../lifecycle/lifecycleBillingObserver.js');
    void observeBillingLifecycleEventWithKanbanActual(
      'subscription.cancelled',
      { tenantId, subscriptionId },
      'cancelSubscription_immediate',
    );
    const { promoteLifecycleCard } = await import('../lifecycle/lifecyclePromotionService.js');
    void promoteLifecycleCard({
      eventType: 'subscription.cancelled',
      context: { tenantId, subscriptionId },
      source: 'cancelSubscription_immediate',
    });
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
  const { observeBillingLifecycleEventWithKanbanActual } = await import('../lifecycle/lifecycleBillingObserver.js');
  for (const row of r.rows) {
    const sub = await getSubscriptionById(row.id);
    if (sub) {
      await pool.query(
        `UPDATE tenants SET status = 'trial', plan_period_end = CURRENT_DATE, updated_at = now() WHERE id = $1`,
        [sub.tenant_id]
      );
      // lifecycle shadow observation
      void observeBillingLifecycleEventWithKanbanActual(
        'subscription.cancelled',
        { tenantId: sub.tenant_id, subscriptionId: sub.id },
        'expireCancelledSubscriptions',
      );
      const { promoteLifecycleCard } = await import('../lifecycle/lifecyclePromotionService.js');
      void promoteLifecycleCard({
        eventType: 'subscription.cancelled',
        context: { tenantId: sub.tenant_id, subscriptionId: sub.id },
        source: 'expireCancelledSubscriptions',
      });
    }
  }
  return r.rows.length;
}

/**
 * Deriva valores de snapshot contratual a partir da fatura paga (Etapa 3 — fonte: linha `tenant_billing`).
 * Exportado para testes unitários.
 */
export function deriveCheckoutContractPricingFromBilling(params: {
  planType: string;
  billingAmountCents: number;
  billingUsersCount: number | null | undefined;
  /** `plan_interval_prices.price_per_user_cents` quando custom sem `users_count` na fatura. */
  catalogPricePerUserCents: number | null;
}): {
  contracted_plan_price_cents: number;
  contracted_price_per_user_cents: number | null;
} {
  const total = Math.max(0, params.billingAmountCents);
  const isCustom = params.planType === 'custom';
  if (!isCustom) {
    return { contracted_plan_price_cents: total, contracted_price_per_user_cents: null };
  }
  const uc = params.billingUsersCount;
  if (uc != null && uc > 0) {
    return {
      contracted_plan_price_cents: total,
      contracted_price_per_user_cents: Math.round(total / uc),
    };
  }
  const pu = params.catalogPricePerUserCents;
  return {
    contracted_plan_price_cents: total,
    contracted_price_per_user_cents: pu != null && pu >= 0 ? pu : null,
  };
}

/**
 * Define se um modo de persistência de snapshot deve rodar para este `billing_reason`.
 * - `checkout_initial`: primeira contratação (exclui seat_addon e renovação).
 * - `explicit`: upgrade/downgrade/troca paga (exclui renovação e primeira compra `plan_purchase`).
 */
export function shouldPersistContractSnapshotMode(
  billingReason: string | undefined,
  mode: 'checkout_initial' | 'explicit'
): boolean {
  const r = billingReason ?? 'plan_purchase';
  if (mode === 'checkout_initial') {
    return r !== 'seat_addon' && r !== 'plan_renewal';
  }
  return r !== 'plan_renewal' && r !== 'plan_purchase';
}

function pricingSnapshotSourceForPaidBilling(
  mode: 'checkout_initial' | 'explicit',
  billingReason: string
): string {
  if (mode === 'checkout_initial') return 'checkout';
  switch (billingReason) {
    case 'plan_upgrade':
      return 'contract_change';
    case 'manual_charge':
      return 'manual_charge';
    case 'seat_addon':
      return 'seat_addon';
    default:
      return 'contract_change';
  }
}

/**
 * Grava snapshot contratual a partir da linha `tenant_billing` paga.
 * - `checkout_initial`: só quando `contracted_at IS NULL` (checkout / primeira linha contratual).
 * - `explicit`: sobrescreve snapshot em mudança contratual paga (upgrade, manual_charge, seat_addon, etc.).
 * Renovação (`plan_renewal`) nunca passa pelos filtros acima.
 */
export async function persistContractSnapshotFromPaidBilling(params: {
  tenantId: string;
  subscriptionId: string;
  billing: TenantBillingRow;
  mode: 'checkout_initial' | 'explicit';
}): Promise<void> {
  const { billing, tenantId, subscriptionId, mode } = params;
  const reason = billing.billing_reason ?? 'plan_purchase';
  if (!shouldPersistContractSnapshotMode(reason, mode)) {
    return;
  }

  const planRow = await pool.query<{ plan_type: string | null; name: string }>(
    'SELECT plan_type, name FROM plans WHERE id = $1',
    [billing.plan_id]
  );
  const prow = planRow.rows[0];
  if (!prow) return;

  const planType = prow.plan_type ?? 'standard';
  const interval = (billing.billing_interval ?? 'monthly') as BillingInterval;

  let catalogPu: number | null = null;
  if (planType === 'custom' && (!(billing.users_count != null && billing.users_count > 0))) {
    const pip = await pool.query<{ price_per_user_cents: number }>(
      'SELECT price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1 AND billing_interval = $2',
      [billing.plan_id, interval]
    );
    catalogPu = pip.rows[0]?.price_per_user_cents ?? null;
  }

  const derived = deriveCheckoutContractPricingFromBilling({
    planType,
    billingAmountCents: billing.amount_cents,
    billingUsersCount: billing.users_count,
    catalogPricePerUserCents: catalogPu,
  });

  const source = pricingSnapshotSourceForPaidBilling(mode, reason);
  const initialOnly = mode === 'checkout_initial';

  const r = await pool.query(
    `UPDATE subscriptions
     SET contracted_at = COALESCE($1::timestamptz, now()),
         contracted_billing_interval = $2,
         contracted_plan_price_cents = $3,
         contracted_price_per_user_cents = $4,
         contract_currency = 'BRL',
         pricing_snapshot_source = $5,
         updated_at = now()
     WHERE id = $6::uuid AND tenant_id = $7::uuid AND type = 'saas' AND status = 'active'
       ${initialOnly ? 'AND contracted_at IS NULL' : ''}`,
    [
      billing.paid_at ?? null,
      interval,
      derived.contracted_plan_price_cents,
      derived.contracted_price_per_user_cents,
      source,
      subscriptionId,
      tenantId,
    ]
  );

  if ((r.rowCount ?? 0) < 1) {
    return;
  }

  await pool.query(
    `UPDATE tenant_billing
     SET plan_name_snapshot = COALESCE(plan_name_snapshot, $1),
         plan_price_snapshot = COALESCE(plan_price_snapshot, $2),
         updated_at = now()
     WHERE id = $3::uuid`,
    [prow.name, billing.amount_cents, billing.id]
  );
}

/**
 * Primeira ativação via checkout: grava snapshot na assinatura SaaS a partir da fatura paga.
 * Idempotente: não altera se `contracted_at` já existe (webhook duplicado / reentrância).
 */
export async function applyCheckoutContractSnapshotFromPaidBilling(params: {
  tenantId: string;
  subscriptionId: string;
  billing: TenantBillingRow;
}): Promise<void> {
  await persistContractSnapshotFromPaidBilling({ ...params, mode: 'checkout_initial' });
}

/**
 * Mudança contratual via PATCH (sem nova fatura imediata — Fase 2): atualiza snapshot a partir do valor calculado do plano.
 */
export async function updateSubscriptionContractSnapshotFromCalculatedContract(params: {
  tenantId: string;
  subscriptionId: string;
  planId: string;
  billingInterval: BillingInterval;
  amountCents: number;
  usersCount: number | null | undefined;
}): Promise<void> {
  const planRow = await pool.query<{ plan_type: string | null }>('SELECT plan_type FROM plans WHERE id = $1', [
    params.planId,
  ]);
  const planType = planRow.rows[0]?.plan_type ?? 'standard';
  let catalogPu: number | null = null;
  if (planType === 'custom' && !(params.usersCount != null && params.usersCount > 0)) {
    const pip = await pool.query<{ price_per_user_cents: number }>(
      'SELECT price_per_user_cents FROM plan_interval_prices WHERE plan_id = $1 AND billing_interval = $2',
      [params.planId, params.billingInterval]
    );
    catalogPu = pip.rows[0]?.price_per_user_cents ?? null;
  }

  const derived = deriveCheckoutContractPricingFromBilling({
    planType,
    billingAmountCents: params.amountCents,
    billingUsersCount: params.usersCount,
    catalogPricePerUserCents: catalogPu,
  });

  await pool.query(
    `UPDATE subscriptions
     SET contracted_at = now(),
         contracted_billing_interval = $1,
         contracted_plan_price_cents = $2,
         contracted_price_per_user_cents = $3,
         contract_currency = 'BRL',
         pricing_snapshot_source = 'self_service',
         updated_at = now()
     WHERE id = $4::uuid AND tenant_id = $5::uuid AND type = 'saas' AND status = 'active'`,
    [
      params.billingInterval,
      derived.contracted_plan_price_cents,
      derived.contracted_price_per_user_cents,
      params.subscriptionId,
      params.tenantId,
    ]
  );
}

/**
 * Altera plano da assinatura (upgrade/downgrade). Próxima cobrança usará o novo plano; sem cobrança imediata na Fase 2.
 * `syncContractSnapshot`: apenas alterações explícitas pelo tenant (PATCH); worker de renovação/agendamentos não deve passar true.
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  tenantId: string,
  data: { plan_id: string; billing_interval?: BillingInterval; users_count?: number | null },
  options?: { syncContractSnapshot?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub || sub.tenant_id !== tenantId) {
    return { ok: false, error: 'Assinatura não encontrada ou não pertence a esta conta' };
  }
  if (sub.status !== 'active') {
    return { ok: false, error: 'Assinatura não está ativa' };
  }

  const { calculateInvoiceAmount, tryResolveSubscriptionLineAmountFromContractSnapshot } =
    await import('./billingService.js');
  const { validatePlanForPurchase } = await import('./billingService.js');
  await validatePlanForPurchase(data.plan_id, data.users_count ?? null);

  const planTypeRow = await pool.query<{ plan_type: string | null }>(
    'SELECT plan_type FROM plans WHERE id = $1 AND is_active = true',
    [data.plan_id]
  );
  if (planTypeRow.rows.length === 0) {
    return { ok: false, error: 'Plano não encontrado ou inativo' };
  }
  const planType = planTypeRow.rows[0]?.plan_type ?? 'standard';

  const interval = (data.billing_interval ?? sub.billing_interval) as BillingInterval;
  const samePlanContract =
    data.plan_id === sub.plan_id && String(interval) === String(sub.billing_interval);

  let amountCents = await calculateInvoiceAmount(
    data.plan_id,
    interval,
    data.users_count ?? sub.users_count ?? null,
    { tenantId, context: 'checkout' },
  );

  if (samePlanContract) {
    const fromSnap = tryResolveSubscriptionLineAmountFromContractSnapshot(
      planType,
      data.users_count ?? sub.users_count ?? null,
      sub.contracted_plan_price_cents,
      sub.contracted_price_per_user_cents
    );
    if (fromSnap != null) {
      amountCents = fromSnap;
    }
  }

  await pool.query(
    `UPDATE subscriptions
     SET plan_id = $1, amount_cents = $2, billing_interval = $3, users_count = COALESCE($4, users_count), updated_at = now()
     WHERE id = $5 AND tenant_id = $6`,
    [data.plan_id, amountCents, interval, data.users_count ?? null, subscriptionId, tenantId]
  );

  if (options?.syncContractSnapshot) {
    await updateSubscriptionContractSnapshotFromCalculatedContract({
      tenantId,
      subscriptionId,
      planId: data.plan_id,
      billingInterval: interval,
      amountCents,
      usersCount: data.users_count ?? sub.users_count ?? null,
    });
  }

  return { ok: true };
}
