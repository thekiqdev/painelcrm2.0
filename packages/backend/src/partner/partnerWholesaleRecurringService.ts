/**
 * M5-W License Sprint 2 — valor recorrente do plano atacado (pacote + extras × overage).
 * Não altera partner_wholesale_plans.price_cents. O one-shot de top-up já é a diferença agora;
 * este módulo só reajusta o snapshot da assinatura Platform (próximo ciclo Asaas).
 */

import { pool } from '../utils/db.js';
import {
  getActiveSaasSubscriptionByTenant,
  getOpenSaasSubscriptionByTenant,
} from '../services/billingSubscriptionService.js';
import { getWholesalePlan } from './partnerWholesalePlanService.js';

export type WholesaleRecurringQuote = {
  partner_tenant_id: string;
  wholesale_plan_id: string;
  plan_price_cents: number;
  extra_seats: number;
  included_seats: number;
  purchased_seats: number;
  unit_overage_cents: number | null;
  recurring_amount_cents: number;
  extras_cents: number;
  billing_interval: string;
  subscription_id: string | null;
  previous_amount_cents: number | null;
};

export function computeWholesaleRecurringAmountCents(input: {
  planPriceCents: number;
  extraSeats: number;
  unitOverageCents: number | null;
}): { recurring_amount_cents: number; extras_cents: number } {
  const plan = Math.max(0, Math.floor(Number(input.planPriceCents) || 0));
  const extra = Math.max(0, Math.floor(Number(input.extraSeats) || 0));
  const overage =
    input.unitOverageCents != null && Number.isFinite(input.unitOverageCents)
      ? Math.max(0, Math.floor(input.unitOverageCents))
      : 0;
  const extras_cents = extra * overage;
  return { recurring_amount_cents: plan + extras_cents, extras_cents };
}

async function resolveWholesaleSubscriptionId(
  partnerTenantId: string,
  preferredId: string | null
): Promise<{ id: string; amount_cents: number } | null> {
  if (preferredId) {
    const r = await pool.query<{ id: string; amount_cents: number }>(
      `SELECT id::text, amount_cents
       FROM subscriptions
       WHERE id = $1 AND tenant_id = $2 AND type = 'saas'
         AND status = ANY($3::text[])
       LIMIT 1`,
      [preferredId, partnerTenantId, ['active', 'past_due', 'trialing']]
    );
    if (r.rows[0]) return r.rows[0];
  }
  const active = await getActiveSaasSubscriptionByTenant(partnerTenantId);
  if (active) return { id: active.id, amount_cents: active.amount_cents };
  const open = await getOpenSaasSubscriptionByTenant(partnerTenantId);
  if (open) return { id: open.id, amount_cents: open.amount_cents };
  return null;
}

export async function quoteWholesaleRecurringAmount(
  partnerTenantId: string,
  opts?: { extraSeats?: number }
): Promise<WholesaleRecurringQuote | null> {
  const wr = await pool.query<{
    wholesale_plan_id: string | null;
    wholesale_subscription_id: string | null;
    extra_seats: number | null;
    included_seats: number | null;
    purchased_seats: number | null;
  }>(
    `SELECT pp.wholesale_plan_id::text,
            pp.wholesale_subscription_id::text,
            COALESCE(pl.extra_seats, 0) AS extra_seats,
            COALESCE(pl.included_seats, 0) AS included_seats,
            COALESCE(pl.purchased_seats, 0) AS purchased_seats
     FROM partner_profiles pp
     LEFT JOIN partner_license_pool pl ON pl.partner_tenant_id = pp.partner_tenant_id
     WHERE pp.partner_tenant_id = $1`,
    [partnerTenantId]
  );
  const row = wr.rows[0];
  if (!row?.wholesale_plan_id) return null;

  const plan = await getWholesalePlan(row.wholesale_plan_id);
  if (!plan) return null;

  const extraSeats =
    opts?.extraSeats != null && Number.isFinite(opts.extraSeats)
      ? Math.max(0, Math.floor(opts.extraSeats))
      : Number(row.extra_seats ?? 0);
  const priced = computeWholesaleRecurringAmountCents({
    planPriceCents: plan.price_cents,
    extraSeats,
    unitOverageCents: plan.unit_overage_cents,
  });
  const sub = await resolveWholesaleSubscriptionId(partnerTenantId, row.wholesale_subscription_id);

  return {
    partner_tenant_id: partnerTenantId,
    wholesale_plan_id: plan.id,
    plan_price_cents: plan.price_cents,
    extra_seats: extraSeats,
    included_seats: Number(row.included_seats ?? 0),
    purchased_seats: Number(row.purchased_seats ?? 0),
    unit_overage_cents: plan.unit_overage_cents,
    recurring_amount_cents: priced.recurring_amount_cents,
    extras_cents: priced.extras_cents,
    billing_interval: plan.billing_interval,
    subscription_id: sub?.id ?? null,
    previous_amount_cents: sub?.amount_cents ?? null,
  };
}

/**
 * Grava amount + snapshot contratual para o próximo ciclo do job Asaas Platform.
 */
export async function syncPartnerWholesaleRecurringAmount(
  partnerTenantId: string
): Promise<WholesaleRecurringQuote | null> {
  const quote = await quoteWholesaleRecurringAmount(partnerTenantId);
  if (!quote) return null;

  const sub = quote.subscription_id
    ? { id: quote.subscription_id, amount_cents: quote.previous_amount_cents ?? 0 }
    : await resolveWholesaleSubscriptionId(partnerTenantId, null);
  if (!sub) {
    console.log('[WHOLESALE] recurring sync skipped — sem subscription', { partnerTenantId });
    return quote;
  }

  await pool.query(
    `UPDATE subscriptions
     SET amount_cents = $1,
         users_count = $2,
         contracted_at = COALESCE(contracted_at, now()),
         contracted_billing_interval = $3,
         contracted_plan_price_cents = $1,
         contracted_price_per_user_cents = NULL,
         contract_currency = 'BRL',
         pricing_snapshot_source = 'partner_wholesale',
         updated_at = now()
     WHERE id = $4 AND tenant_id = $5 AND type = 'saas'`,
    [
      quote.recurring_amount_cents,
      quote.purchased_seats > 0 ? quote.purchased_seats : null,
      quote.billing_interval,
      sub.id,
      partnerTenantId,
    ]
  );

  await pool.query(
    `UPDATE partner_profiles
     SET wholesale_subscription_id = $1, updated_at = now()
     WHERE partner_tenant_id = $2
       AND (wholesale_subscription_id IS NULL OR wholesale_subscription_id <> $1)`,
    [sub.id, partnerTenantId]
  );

  console.log('[WHOLESALE] recurring amount synced', {
    partnerTenantId,
    subscriptionId: sub.id,
    previous: quote.previous_amount_cents,
    next: quote.recurring_amount_cents,
    extraSeats: quote.extra_seats,
  });

  return { ...quote, subscription_id: sub.id, previous_amount_cents: sub.amount_cents };
}

/** Renovação SaaS: se a subscription for o plano atacado do Partner, usa pacote + extras. */
export async function tryResolveWholesaleRenewalAmount(params: {
  tenantId: string;
  subscriptionId: string;
}): Promise<{ amountCents: number; extraSeats: number; planPriceCents: number } | null> {
  const r = await pool.query<{ ok: boolean }>(
    `SELECT true AS ok
     FROM partner_profiles
     WHERE partner_tenant_id = $1
       AND wholesale_plan_id IS NOT NULL
       AND COALESCE(wholesale_status, 'none') = ANY($2::text[])
       AND (wholesale_subscription_id IS NULL OR wholesale_subscription_id = $3)
     LIMIT 1`,
    [params.tenantId, ['active', 'past_due'], params.subscriptionId]
  );
  if (!r.rows[0]) return null;
  const quote = await quoteWholesaleRecurringAmount(params.tenantId);
  if (!quote) return null;
  return {
    amountCents: quote.recurring_amount_cents,
    extraSeats: quote.extra_seats,
    planPriceCents: quote.plan_price_cents,
  };
}
