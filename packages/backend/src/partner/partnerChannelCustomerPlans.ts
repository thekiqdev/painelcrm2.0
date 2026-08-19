/**
 * M5 — catálogo e troca de planos do canal Partner para customer_tenant.
 */

import { pool } from '../utils/db.js';
import { createInvoice, type BillingInterval } from '../services/invoiceService.js';
import { schedulePublishPlatformBillingChargeCreated } from '../services/platformNotifications/platformBusinessNotifications.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { resolveDefaultPlanId } from './partnerRepository.js';
import {
  getPartnerSellPlan,
  listActivePartnerSellPlans,
  type PartnerSellPlanRow,
} from './partnerSellPlanService.js';

export type ChannelCatalogPlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  billing_interval: string;
  plan_type: 'standard';
  is_free: boolean;
  free_access_days: number | null;
  trial_days: number;
  benefits: Array<{ label: string }>;
  partner_sell_plan_id: string;
  channel: 'partner';
};

export type PartnerChannelTenantContext = {
  tenant_id: string;
  account_type: string;
  partner_id: string | null;
  partner_sell_plan_id: string | null;
  plan_id: string | null;
  has_used_trial: boolean;
};

function mapSellIntervalToPlatform(interval: string): BillingInterval {
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

function benefitsFromFeatures(features: Record<string, unknown>): Array<{ label: string }> {
  const raw = features.benefits;
  if (Array.isArray(raw)) {
    return raw
      .map((b) => {
        if (typeof b === 'string') return { label: b };
        if (b && typeof b === 'object' && 'label' in b && typeof (b as { label: unknown }).label === 'string') {
          return { label: (b as { label: string }).label };
        }
        return null;
      })
      .filter((x): x is { label: string } => Boolean(x));
  }
  return [];
}

export function mapSellPlanToCatalog(plan: PartnerSellPlanRow): ChannelCatalogPlan {
  const trial = Math.max(0, plan.trial_days || 0);
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: null,
    price_cents: plan.price_cents,
    billing_interval: mapSellIntervalToPlatform(plan.billing_interval),
    plan_type: 'standard',
    is_free: plan.price_cents === 0,
    free_access_days: trial > 0 ? trial : null,
    trial_days: trial,
    benefits: benefitsFromFeatures(plan.features_json),
    partner_sell_plan_id: plan.id,
    channel: 'partner',
  };
}

export async function getPartnerChannelTenantContext(
  tenantId: string
): Promise<PartnerChannelTenantContext | null> {
  const r = await pool.query<{
    tenant_id: string;
    account_type: string;
    partner_id: string | null;
    partner_sell_plan_id: string | null;
    plan_id: string | null;
    has_used_trial: boolean | null;
  }>(
    `SELECT id::text AS tenant_id, account_type,
            partner_id::text AS partner_id,
            partner_sell_plan_id::text AS partner_sell_plan_id,
            plan_id::text AS plan_id,
            COALESCE(has_used_trial, false) AS has_used_trial
     FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    tenant_id: row.tenant_id,
    account_type: row.account_type,
    partner_id: row.partner_id,
    partner_sell_plan_id: row.partner_sell_plan_id,
    plan_id: row.plan_id,
    has_used_trial: Boolean(row.has_used_trial),
  };
}

export async function listChannelAvailablePlans(
  tenantId: string
): Promise<{ channel: 'partner' | 'platform'; plans: ChannelCatalogPlan[] } | null> {
  const ctx = await getPartnerChannelTenantContext(tenantId);
  if (!ctx || ctx.account_type !== 'customer_tenant' || !ctx.partner_id) {
    return null;
  }
  const sell = await listActivePartnerSellPlans(ctx.partner_id);
  return { channel: 'partner', plans: sell.map(mapSellPlanToCatalog) };
}

export async function getPartnerSellPlanOverlay(
  tenantId: string
): Promise<{
  partner_sell_plan_id: string;
  name: string;
  slug: string;
  price_cents: number;
  billing_interval: string;
  trial_days: number;
  benefits: Array<{ label: string }>;
  channel: 'partner';
} | null> {
  const ctx = await getPartnerChannelTenantContext(tenantId);
  if (!ctx?.partner_id || !ctx.partner_sell_plan_id) return null;
  const sell = await getPartnerSellPlan(ctx.partner_id, ctx.partner_sell_plan_id);
  if (!sell) return null;
  return {
    partner_sell_plan_id: sell.id,
    name: sell.name,
    slug: sell.slug,
    price_cents: sell.price_cents,
    billing_interval: mapSellIntervalToPlatform(sell.billing_interval),
    trial_days: sell.trial_days,
    benefits: benefitsFromFeatures(sell.features_json),
    channel: 'partner',
  };
}

/**
 * Aplica o plano comercial do Partner sobre a linha de `plans` (envelope).
 * Fonte comercial = partner_sell_plans; envelope técnico permanece em plan.id original.
 */
export function applyPartnerCommercialOverlay(
  plan: Record<string, unknown>,
  overlay: NonNullable<Awaited<ReturnType<typeof getPartnerSellPlanOverlay>>>
): void {
  plan.envelope_plan_id = plan.id;
  plan.partner_sell_plan_id = overlay.partner_sell_plan_id;
  plan.channel = 'partner';
  plan.name = overlay.name;
  plan.slug = overlay.slug;
  plan.price_cents = overlay.price_cents;
  plan.billing_interval = overlay.billing_interval;
  plan.plan_type = 'standard';
  plan.is_free = overlay.price_cents === 0;
  plan.free_access_days = overlay.trial_days > 0 ? overlay.trial_days : null;
  plan.benefits = overlay.benefits;
  plan.description =
    overlay.trial_days > 0
      ? `Plano do canal · teste grátis de ${overlay.trial_days} dia(s)`
      : 'Plano do canal Partner';
  // Evita MeuPlano calcular preço por interval_prices do envelope SaaS custom
  plan.interval_prices = [];
}

export async function resolvePartnerCommercialAmountCents(
  tenantId: string
): Promise<{ amount_cents: number; plan_name: string; billing_interval: string } | null> {
  const overlay = await getPartnerSellPlanOverlay(tenantId);
  if (!overlay) return null;
  return {
    amount_cents: overlay.price_cents,
    plan_name: overlay.name,
    billing_interval: overlay.billing_interval,
  };
}

async function resolvePlatformPlanId(sell: PartnerSellPlanRow, currentPlanId: string | null): Promise<string> {
  if (sell.source_platform_plan_id) return sell.source_platform_plan_id;
  if (currentPlanId) return currentPlanId;
  const def = await resolveDefaultPlanId();
  if (!def) {
    throw new PartnerAdminError('Nenhum plano de plataforma disponível', 'PLAN_REQUIRED', 500);
  }
  return def;
}

export type PartnerSellPlanCheckoutResult =
  | { mode: 'trial_activated'; trial_ends_at: string; sell_plan_id: string }
  | { mode: 'activated_free'; sell_plan_id: string }
  | { mode: 'checkout'; billing_id: string; amount_cents: number; sell_plan_id: string };

/**
 * Troca/ativa plano de venda do Partner para o customer_tenant autenticado.
 * Trial/grátis: ativa na hora. Pago: cria fatura no valor do sell plan (gateway do Partner).
 */
export async function checkoutPartnerSellPlanForCustomer(
  tenantId: string,
  sellPlanId: string,
  opts?: { preferTrial?: boolean }
): Promise<PartnerSellPlanCheckoutResult> {
  const ctx = await getPartnerChannelTenantContext(tenantId);
  if (!ctx || ctx.account_type !== 'customer_tenant' || !ctx.partner_id) {
    throw new PartnerAdminError('Conta não pertence a um canal Partner', 'NOT_PARTNER_CUSTOMER', 400);
  }

  const sell = await getPartnerSellPlan(ctx.partner_id, sellPlanId);
  if (!sell || sell.status !== 'active') {
    throw new PartnerAdminError('Plano de venda inválido ou inativo', 'SELL_PLAN_INVALID', 400);
  }

  const platformPlanId = await resolvePlatformPlanId(sell, ctx.plan_id);
  const interval = mapSellIntervalToPlatform(sell.billing_interval);
  const preferTrial = opts?.preferTrial !== false;
  const canTrial = preferTrial && sell.trial_days > 0 && !ctx.has_used_trial;

  if (canTrial) {
    const ends = new Date();
    ends.setUTCDate(ends.getUTCDate() + sell.trial_days);
    await pool.query(
      `UPDATE tenants SET
         partner_sell_plan_id = $1,
         plan_id = $2,
         status = 'trial',
         trial_ends_at = $3,
         has_used_trial = true,
         trial_consumed_at = COALESCE(trial_consumed_at, now()),
         updated_at = now()
       WHERE id = $4`,
      [sell.id, platformPlanId, ends.toISOString(), tenantId]
    );
    await pool.query(
      `INSERT INTO tenant_plan (tenant_id, plan_id, starts_at)
       SELECT $1, $2, now()
       WHERE NOT EXISTS (SELECT 1 FROM tenant_plan WHERE tenant_id = $1)`,
      [tenantId, platformPlanId]
    );
    await pool.query(
      `UPDATE tenant_plan SET plan_id = $1, starts_at = now() WHERE tenant_id = $2`,
      [platformPlanId, tenantId]
    );
    return {
      mode: 'trial_activated',
      trial_ends_at: ends.toISOString(),
      sell_plan_id: sell.id,
    };
  }

  if (sell.price_cents <= 0) {
    await pool.query(
      `UPDATE tenants SET
         partner_sell_plan_id = $1,
         plan_id = $2,
         status = 'active',
         trial_ends_at = NULL,
         updated_at = now()
       WHERE id = $3`,
      [sell.id, platformPlanId, tenantId]
    );
    await pool.query(
      `INSERT INTO tenant_plan (tenant_id, plan_id, starts_at)
       SELECT $1, $2, now()
       WHERE NOT EXISTS (SELECT 1 FROM tenant_plan WHERE tenant_id = $1)`,
      [tenantId, platformPlanId]
    );
    await pool.query(
      `UPDATE tenant_plan SET plan_id = $1, starts_at = now() WHERE tenant_id = $2`,
      [platformPlanId, tenantId]
    );
    return { mode: 'activated_free', sell_plan_id: sell.id };
  }

  // Associa o sell plan agora; ativação plena após pagamento (fluxo SaaS existente).
  await pool.query(
    `UPDATE tenants SET partner_sell_plan_id = $1, plan_id = $2, updated_at = now() WHERE id = $3`,
    [sell.id, platformPlanId, tenantId]
  );

  const due = new Date();
  due.setDate(due.getDate() + 7);
  const billing = await createInvoice({
    tenant_id: tenantId,
    plan_id: platformPlanId,
    billing_interval: interval,
    amount_cents: sell.price_cents,
    due_date: due,
    source: 'self_service',
    billing_reason: 'plan_upgrade',
    gateway: 'asaas',
    plan_name_snapshot: sell.name,
    plan_price_snapshot: sell.price_cents,
  });

  schedulePublishPlatformBillingChargeCreated(billing.id);

  return {
    mode: 'checkout',
    billing_id: billing.id,
    amount_cents: sell.price_cents,
    sell_plan_id: sell.id,
  };
}
