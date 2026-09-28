/**
 * Regras comerciais de assentos: upgrade pago via checkout e downgrade no próximo ciclo.
 * SE S2: também planos standard com teto (`max_users`) + preço avulso (`price_per_user_cents`).
 */
import { pool } from '../utils/db.js';
import {
  calculateSeatAddonProrata,
  type BillingInterval,
  type SeatAddonProrataBreakdown,
} from './billingService.js';
import { getInvoiceById } from './invoiceService.js';
import { getActiveSaasSubscriptionByTenantAutoRepair } from './billingSubscriptionService.js';
import {
  ensureUsableSaasSubscriptionForActivePaidTenant,
  subscribeSeatAddon,
} from './subscriptionService.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { getTenantLimit } from './tenantLimitService.js';

const OPEN_SEAT_ADDON_STATUSES = ['pending', 'waiting_payment', 'processing', 'overdue'] as const;

export async function repairSeatAddonPendingPointer(tenantId: string): Promise<void> {
  const r = await pool.query<{ b: string | null }>(
    `SELECT seat_addon_pending_billing_id AS b FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const bid = r.rows[0]?.b;
  if (!bid) return;
  const inv = await getInvoiceById(bid);
  const open =
    inv &&
    OPEN_SEAT_ADDON_STATUSES.includes(inv.status as (typeof OPEN_SEAT_ADDON_STATUSES)[number]);
  if (!open) {
    await pool.query(
      `UPDATE tenants SET seat_addon_pending_billing_id = NULL, updated_at = now() WHERE id = $1`,
      [tenantId]
    );
  }
}

/** Assentos contratados (custom): override ou users_count da assinatura. */
export function effectiveContractedSeats(params: {
  max_users_override: number | null;
  subscription_users_count: number | null;
}): number {
  const v = params.max_users_override ?? params.subscription_users_count ?? 1;
  return Math.max(1, v);
}

/**
 * Assentos contratados efetivos.
 * - standard: override || max_users do plano (ilimitado = null → extras não se aplicam)
 * - custom: override || users_count da assinatura
 */
export async function resolveEffectiveContractedSeats(params: {
  tenantId: string;
  planType: string;
  subscriptionUsersCount: number | null;
}): Promise<number> {
  const { tenantId, planType, subscriptionUsersCount } = params;
  if (planType === 'standard') {
    const limit = await getTenantLimit(tenantId, 'max_users', 'max_users_override');
    if (limit == null) {
      throw new Error(
        'Este plano não tem limite de usuários (ilimitado). Defina um máximo no plano antes de vender extras.'
      );
    }
    return Math.max(1, limit);
  }
  const trow = await pool.query<{ max_users_override: number | null }>(
    `SELECT max_users_override FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return effectiveContractedSeats({
    max_users_override: trow.rows[0]?.max_users_override ?? null,
    subscription_users_count: subscriptionUsersCount,
  });
}

function assertSeatAddonPlanAllowed(planType: string, planMaxUsers: number | null): void {
  if (planType === 'custom') return;
  if (planType === 'standard') {
    if (planMaxUsers == null) {
      throw new Error(
        'Este plano não tem limite de usuários (ilimitado). Defina um máximo no plano antes de vender extras.'
      );
    }
    return;
  }
  throw new Error('Contratação incremental de assentos não está disponível para este tipo de plano');
}

export async function previewSeatAddonPurchase(params: {
  tenantId: string;
  planId: string;
  planType: string;
  additionalSeats: number;
}): Promise<{
  current_contracted: number;
  new_total: number;
  breakdown: SeatAddonProrataBreakdown;
  billing_interval: BillingInterval;
}> {
  const { tenantId, planId, planType, additionalSeats } = params;
  if (!Number.isInteger(additionalSeats) || additionalSeats < 1) {
    throw new Error('Informe um número inteiro de novos assentos (mínimo 1)');
  }

  await ensureUsableSaasSubscriptionForActivePaidTenant(tenantId);
  const sub = await getActiveSaasSubscriptionByTenantAutoRepair(tenantId);
  if (!sub?.current_period_start || !sub.current_period_end) {
    throw new Error(
      'Não foi possível calcular o valor proporcional agora. Atualize a página em instantes ou entre em contato com o suporte se continuar.'
    );
  }

  const planRow = await pool.query<{ max_users: number | null }>(
    `SELECT max_users FROM plans WHERE id = $1`,
    [planId]
  );
  const planMaxUsers = planRow.rows[0]?.max_users ?? null;
  assertSeatAddonPlanAllowed(planType, planMaxUsers);

  const currentContracted = await resolveEffectiveContractedSeats({
    tenantId,
    planType,
    subscriptionUsersCount: sub.users_count ?? null,
  });
  const newTotal = currentContracted + additionalSeats;

  // Custom: max_users do catálogo é teto rígido (se definido). Standard: max_users = incluso (extras livres).
  if (planType === 'custom' && planMaxUsers !== null && newTotal > planMaxUsers) {
    throw new Error(
      `Este plano suporta no máximo ${planMaxUsers} assentos. ` +
        `Você possui ${currentContracted} e está tentando adicionar ${additionalSeats} (total: ${newTotal}).`
    );
  }

  const billingInterval = (sub.billing_interval ?? 'monthly') as BillingInterval;

  if (planType === 'standard') {
    const catalog = await pool.query<{ price_per_user_cents: number }>(
      `SELECT price_per_user_cents FROM plan_interval_prices
       WHERE plan_id = $1 AND billing_interval = $2`,
      [planId, billingInterval]
    );
    const unit = catalog.rows[0]?.price_per_user_cents ?? 0;
    const contractedUnit = sub.contracted_price_per_user_cents;
    const effectiveUnit =
      contractedUnit != null && contractedUnit > 0 ? contractedUnit : unit;
    if (effectiveUnit <= 0) {
      throw new Error(
        'Este plano não tem valor por usuário avulso configurado. Defina o preço no catálogo (Super Admin) antes de vender extras.'
      );
    }
  }

  const breakdown = await calculateSeatAddonProrata(
    planId,
    billingInterval,
    additionalSeats,
    sub.current_period_start,
    sub.current_period_end,
    {
      contractedPricePerUserCents:
        sub.contracted_price_per_user_cents != null && sub.contracted_price_per_user_cents > 0
          ? sub.contracted_price_per_user_cents
          : null,
    }
  );

  return {
    current_contracted: currentContracted,
    new_total: newTotal,
    breakdown,
    billing_interval: billingInterval,
  };
}

export async function startSeatAddonCheckout(params: {
  tenantId: string;
  planId: string;
  planType: string;
  additionalSeats: number;
  paymentMethod?: PaymentMethod;
}) {
  await repairSeatAddonPendingPointer(params.tenantId);

  const pending = await pool.query<{ b: string | null }>(
    `SELECT seat_addon_pending_billing_id AS b FROM tenants WHERE id = $1`,
    [params.tenantId]
  );
  const bid = pending.rows[0]?.b;
  if (bid) {
    const inv = await getInvoiceById(bid);
    if (
      inv &&
      OPEN_SEAT_ADDON_STATUSES.includes(inv.status as (typeof OPEN_SEAT_ADDON_STATUSES)[number])
    ) {
      throw new Error(
        'Já existe uma cobrança de assentos adicionais em aberto. Conclua o pagamento no checkout ou aguarde a confirmação.'
      );
    }
  }

  const preview = await previewSeatAddonPurchase({
    tenantId: params.tenantId,
    planId: params.planId,
    planType: params.planType,
    additionalSeats: params.additionalSeats,
  });

  const breakdownPayload: Record<string, unknown> = {
    ...preview.breakdown,
    previous_contracted: preview.current_contracted,
    new_total_users: preview.new_total,
  };

  return subscribeSeatAddon({
    tenantId: params.tenantId,
    planId: params.planId,
    billingInterval: preview.billing_interval,
    newTotalUsersCount: preview.new_total,
    amountCents: preview.breakdown.amount_cents,
    seatAddonBreakdown: breakdownPayload,
    paymentMethod: params.paymentMethod,
    source: 'self_service',
  });
}

export async function scheduleSeatDowngradeNextCycle(params: {
  tenantId: string;
  planType: string;
  targetSeats: number;
  usersInUse: number;
}): Promise<{ scheduled: number | null }> {
  const { tenantId, planType, targetSeats, usersInUse } = params;
  if (planType !== 'custom' && planType !== 'standard') {
    throw new Error('Redução agendada de assentos não está disponível para este tipo de plano');
  }

  await repairSeatAddonPendingPointer(tenantId);

  const pending = await pool.query<{ b: string | null }>(
    `SELECT seat_addon_pending_billing_id AS b FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const bid = pending.rows[0]?.b;
  if (bid) {
    const inv = await getInvoiceById(bid);
    if (
      inv &&
      OPEN_SEAT_ADDON_STATUSES.includes(inv.status as (typeof OPEN_SEAT_ADDON_STATUSES)[number])
    ) {
      throw new Error(
        'Há cobrança de assentos adicionais em aberto. Conclua ou aguarde antes de agendar redução.'
      );
    }
  }

  if (!Number.isInteger(targetSeats) || targetSeats < 1) {
    throw new Error('A quantidade alvo deve ser um inteiro maior ou igual a 1');
  }
  if (targetSeats < usersInUse) {
    throw new Error(
      `Não é possível agendar menos assentos (${targetSeats}) do que usuários em uso (${usersInUse}). Remova usuários antes ou ajuste o valor.`
    );
  }

  const planRow = await pool.query<{ max_users: number | null }>(
    `SELECT p.max_users
     FROM tenants t
     JOIN plans p ON p.id = t.plan_id
     WHERE t.id = $1`,
    [tenantId]
  );
  const planIncluded = planRow.rows[0]?.max_users ?? null;

  if (planType === 'standard') {
    if (planIncluded == null) {
      throw new Error(
        'Este plano não tem limite de usuários (ilimitado). Redução agendada não se aplica.'
      );
    }
    if (targetSeats < planIncluded) {
      throw new Error(
        `Não é possível agendar abaixo dos ${planIncluded} usuários inclusos no plano. Para menos, altere o plano.`
      );
    }
  }

  const sub = await getActiveSaasSubscriptionByTenantAutoRepair(tenantId);
  const currentContracted = await resolveEffectiveContractedSeats({
    tenantId,
    planType,
    subscriptionUsersCount: sub?.users_count ?? null,
  });

  if (targetSeats >= currentContracted) {
    await pool.query(
      `UPDATE tenants SET max_users_scheduled_next_cycle = NULL, updated_at = now() WHERE id = $1`,
      [tenantId]
    );
    return { scheduled: null };
  }

  await pool.query(
    `UPDATE tenants SET max_users_scheduled_next_cycle = $1, updated_at = now() WHERE id = $2`,
    [targetSeats, tenantId]
  );
  return { scheduled: targetSeats };
}
