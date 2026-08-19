/**
 * M5 S3 — planos de venda do Partner (license_pool).
 */

import { pool } from '../utils/db.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { getPartnerLicenseSummary } from './partnerLicenseService.js';
import { getPartnerProfile } from './partnerRepository.js';

export type PartnerSellPlanRow = {
  id: string;
  partner_tenant_id: string;
  source_platform_plan_id: string | null;
  name: string;
  slug: string;
  price_cents: number;
  billing_interval: string;
  features_json: Record<string, unknown>;
  status: 'draft' | 'active' | 'archived';
  trial_days: number;
  created_at: string;
  updated_at: string;
};

export type CreateSellPlanInput = {
  name: string;
  slug?: string;
  price_cents: number;
  billing_interval?: string;
  features_json?: Record<string, unknown>;
  source_platform_plan_id?: string | null;
  status?: 'draft' | 'active' | 'archived';
  /** Dias de teste grátis (0 = sem trial). */
  trial_days?: number;
};

export type PatchSellPlanInput = Partial<CreateSellPlanInput>;

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function floorForPartner(partnerTenantId: string): Promise<number> {
  const profile = await getPartnerProfile(partnerTenantId);
  if (!profile) throw new PartnerAdminError('Partner não encontrado', 'NOT_FOUND', 404);
  if (profile.program_type !== 'license_pool') {
    throw new PartnerAdminError(
      'MVP S3: sell-plans só para license_pool',
      'PROGRAM_MVP_ONLY',
      400
    );
  }
  const floor = profile.program_config_json?.floor_price_cents;
  return typeof floor === 'number' && Number.isFinite(floor) ? Math.floor(floor) : 0;
}

function mapRow(r: Record<string, unknown>): PartnerSellPlanRow {
  return {
    id: String(r.id),
    partner_tenant_id: String(r.partner_tenant_id),
    source_platform_plan_id: r.source_platform_plan_id ? String(r.source_platform_plan_id) : null,
    name: String(r.name),
    slug: String(r.slug),
    price_cents: Number(r.price_cents),
    billing_interval: String(r.billing_interval),
    features_json:
      r.features_json && typeof r.features_json === 'object'
        ? (r.features_json as Record<string, unknown>)
        : {},
    status: r.status as PartnerSellPlanRow['status'],
    trial_days: Math.max(0, Math.floor(Number(r.trial_days) || 0)),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

const SELL_PLAN_SELECT = `id, partner_tenant_id, source_platform_plan_id, name, slug, price_cents,
            billing_interval, features_json, status, trial_days,
            created_at::text, updated_at::text`;

export async function listPartnerSellPlans(
  partnerTenantId: string
): Promise<PartnerSellPlanRow[]> {
  const result = await pool.query(
    `SELECT ${SELL_PLAN_SELECT}
     FROM partner_sell_plans
     WHERE partner_tenant_id = $1
     ORDER BY created_at DESC`,
    [partnerTenantId]
  );
  return result.rows.map(mapRow);
}

export async function getPartnerSellPlan(
  partnerTenantId: string,
  planId: string
): Promise<PartnerSellPlanRow | null> {
  const result = await pool.query(
    `SELECT ${SELL_PLAN_SELECT}
     FROM partner_sell_plans
     WHERE partner_tenant_id = $1 AND id = $2`,
    [partnerTenantId, planId]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listActivePartnerSellPlans(
  partnerTenantId: string
): Promise<PartnerSellPlanRow[]> {
  const result = await pool.query(
    `SELECT ${SELL_PLAN_SELECT}
     FROM partner_sell_plans
     WHERE partner_tenant_id = $1 AND status = 'active'
     ORDER BY price_cents ASC, created_at DESC`,
    [partnerTenantId]
  );
  return result.rows.map(mapRow);
}

export async function findPartnerTenantBySlug(
  slugRaw: string
): Promise<{ id: string; slug: string; name: string } | null> {
  const slug = normalizeSlug(slugRaw);
  if (!slug) return null;
  const r = await pool.query<{ id: string; slug: string; name: string }>(
    `SELECT id::text AS id, slug, name
     FROM tenants
     WHERE account_type = 'partner' AND lower(slug) = lower($1)
     LIMIT 1`,
    [slug]
  );
  return r.rows[0] ?? null;
}

export async function createPartnerSellPlan(
  partnerTenantId: string,
  input: CreateSellPlanInput
): Promise<PartnerSellPlanRow> {
  const floor = await floorForPartner(partnerTenantId);
  const name = input.name.trim();
  if (!name) throw new PartnerAdminError('Nome obrigatório', 'NAME_REQUIRED');
  const slug = normalizeSlug(input.slug || name);
  if (!slug) throw new PartnerAdminError('Slug inválido', 'SLUG_INVALID');
  const price = Math.floor(input.price_cents);
  if (!Number.isFinite(price) || price < 0) {
    throw new PartnerAdminError('price_cents inválido', 'PRICE_INVALID');
  }
  if (price < floor) {
    throw new PartnerAdminError(
      `Preço abaixo do piso (piso ${floor} centavos)`,
      'PRICE_BELOW_FLOOR',
      400
    );
  }
  const interval = input.billing_interval || 'monthly';
  const status = input.status || 'draft';
  const trialDays = Math.max(0, Math.min(365, Math.floor(Number(input.trial_days ?? 0) || 0)));
  if (status === 'active') {
    const gw = await import('./partnerLicenseService.js').then((m) =>
      m.canPartnerSellWithGateway(partnerTenantId)
    );
    if (!gw.ok) {
      throw new PartnerAdminError(
        'Configure e teste o gateway Asaas antes de publicar planos',
        'GATEWAY_REQUIRED',
        400
      );
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO partner_sell_plans (
         partner_tenant_id, source_platform_plan_id, name, slug, price_cents,
         billing_interval, features_json, status, trial_days
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       RETURNING ${SELL_PLAN_SELECT}`,
      [
        partnerTenantId,
        input.source_platform_plan_id ?? null,
        name,
        slug,
        price,
        interval,
        JSON.stringify(input.features_json ?? {}),
        status,
        trialDays,
      ]
    );
    return mapRow(result.rows[0]);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      throw new PartnerAdminError('Slug já existe', 'SLUG_TAKEN', 409);
    }
    throw err;
  }
}

export async function patchPartnerSellPlan(
  partnerTenantId: string,
  planId: string,
  input: PatchSellPlanInput
): Promise<PartnerSellPlanRow> {
  const existing = await getPartnerSellPlan(partnerTenantId, planId);
  if (!existing) throw new PartnerAdminError('Plano não encontrado', 'NOT_FOUND', 404);

  const floor = await floorForPartner(partnerTenantId);
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const slug =
    input.slug !== undefined ? normalizeSlug(input.slug) : existing.slug;
  const price =
    input.price_cents !== undefined ? Math.floor(input.price_cents) : existing.price_cents;
  if (!Number.isFinite(price) || price < 0) {
    throw new PartnerAdminError('price_cents inválido', 'PRICE_INVALID');
  }
  if (price < floor) {
    throw new PartnerAdminError(
      `Preço abaixo do piso (piso ${floor} centavos)`,
      'PRICE_BELOW_FLOOR',
      400
    );
  }
  const status = input.status ?? existing.status;
  const trialDays =
    input.trial_days !== undefined
      ? Math.max(0, Math.min(365, Math.floor(Number(input.trial_days) || 0)))
      : existing.trial_days;
  if (status === 'active' && existing.status !== 'active') {
    const gw = await import('./partnerLicenseService.js').then((m) =>
      m.canPartnerSellWithGateway(partnerTenantId)
    );
    if (!gw.ok) {
      throw new PartnerAdminError(
        'Configure e teste o gateway Asaas antes de publicar planos',
        'GATEWAY_REQUIRED',
        400
      );
    }
  }

  const result = await pool.query(
    `UPDATE partner_sell_plans SET
       name = $1,
       slug = $2,
       price_cents = $3,
       billing_interval = $4,
       features_json = $5::jsonb,
       status = $6,
       source_platform_plan_id = COALESCE($7, source_platform_plan_id),
       trial_days = $8,
       updated_at = now()
     WHERE id = $9 AND partner_tenant_id = $10
     RETURNING ${SELL_PLAN_SELECT}`,
    [
      name,
      slug,
      price,
      input.billing_interval ?? existing.billing_interval,
      JSON.stringify(input.features_json ?? existing.features_json),
      status,
      input.source_platform_plan_id === undefined ? null : input.source_platform_plan_id,
      trialDays,
      planId,
      partnerTenantId,
    ]
  );
  return mapRow(result.rows[0]);
}

export async function archivePartnerSellPlan(
  partnerTenantId: string,
  planId: string
): Promise<PartnerSellPlanRow> {
  return patchPartnerSellPlan(partnerTenantId, planId, { status: 'archived' });
}

export type SellPlanProjection = {
  price_cents: number;
  unit_cost_cents: number;
  floor_price_cents: number;
  margin_per_cycle_cents: number;
  estimated_customers: number;
  estimated_users_per_customer: number;
  projected_revenue_cents: number;
  projected_cost_cents: number;
  projected_margin_cents: number;
  billing_interval: string;
};

export async function projectSellPlanEarnings(
  partnerTenantId: string,
  opts: {
    price_cents: number;
    billing_interval?: string;
    estimated_customers?: number;
    estimated_users_per_customer?: number;
  }
): Promise<SellPlanProjection> {
  const summary = await getPartnerLicenseSummary(partnerTenantId);
  const floor = summary.floor_price_cents ?? 0;
  const price = Math.floor(opts.price_cents);
  const customers = Math.max(0, Math.floor(opts.estimated_customers ?? 1));
  const usersPer = Math.max(1, Math.floor(opts.estimated_users_per_customer ?? 1));
  const unit = summary.unit_cost_cents;
  const interval = opts.billing_interval || 'monthly';
  // Custo de licença é mensal por usuário; receita segue o intervalo do plano
  const months =
    interval === 'yearly' ? 12 : interval === 'semiannual' ? 6 : interval === 'quarterly' ? 3 : 1;
  const revenue = price * customers;
  const cost = unit * usersPer * customers * months;
  const margin = revenue - cost;
  return {
    price_cents: price,
    unit_cost_cents: unit,
    floor_price_cents: floor,
    margin_per_cycle_cents: price - unit * usersPer * months,
    estimated_customers: customers,
    estimated_users_per_customer: usersPer,
    projected_revenue_cents: revenue,
    projected_cost_cents: cost,
    projected_margin_cents: margin,
    billing_interval: interval,
  };
}
