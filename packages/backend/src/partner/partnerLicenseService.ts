/**
 * M5 S3 — pool de licenças (1 seat = 1 usuário em customer_tenants).
 */

import { pool } from '../utils/db.js';
import { getPartnerLicensePool, getPartnerProfile } from './partnerRepository.js';
import { PartnerAdminError } from './partnerAdminService.js';

export type PartnerLicenseSummary = {
  partner_tenant_id: string;
  purchased_seats: number;
  used_seats: number;
  available_seats: number;
  unit_cost_cents: number;
  /** Preço efetivo para compra avulsa (overage do plano ou unit_cost). */
  topup_unit_price_cents: number;
  topup_price_source: 'wholesale_overage' | 'pool_unit_cost';
  wholesale_status: string | null;
  wholesale_plan_id: string | null;
  floor_price_cents: number | null;
  program_type: string | null;
};

/** Conta users dos customer_tenants do Partner (staff Partner não entra). */
export async function countPartnerUsedSeats(partnerTenantId: string): Promise<number> {
  const result = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE t.account_type = 'customer_tenant'
       AND t.partner_id = $1`,
    [partnerTenantId]
  );
  return parseInt(result.rows[0]?.c || '0', 10) || 0;
}

export async function refreshPartnerUsedSeatsCache(partnerTenantId: string): Promise<number> {
  const used = await countPartnerUsedSeats(partnerTenantId);
  await pool.query(
    `UPDATE partner_license_pool
     SET used_seats_cache = $1, updated_at = now()
     WHERE partner_tenant_id = $2`,
    [used, partnerTenantId]
  );
  return used;
}

export async function getPartnerLicenseSummary(
  partnerTenantId: string
): Promise<PartnerLicenseSummary> {
  const used = await refreshPartnerUsedSeatsCache(partnerTenantId);
  const poolRow = await getPartnerLicensePool(partnerTenantId);
  const profile = await getPartnerProfile(partnerTenantId);
  const purchased = poolRow?.purchased_seats ?? 0;
  const unit = poolRow?.unit_cost_cents ?? 0;
  const cfg = profile?.program_config_json ?? {};
  const floor =
    typeof cfg.floor_price_cents === 'number' && Number.isFinite(cfg.floor_price_cents)
      ? cfg.floor_price_cents
      : null;

  let topupUnit = unit;
  let topupSource: PartnerLicenseSummary['topup_price_source'] = 'pool_unit_cost';
  let wholesalePlanId: string | null = null;
  let wholesaleStatus: string | null = null;

  const wr = await pool.query<{
    wholesale_plan_id: string | null;
    wholesale_status: string | null;
    unit_overage_cents: number | null;
  }>(
    `SELECT pp.wholesale_plan_id::text AS wholesale_plan_id,
            COALESCE(pp.wholesale_status, 'none') AS wholesale_status,
            w.unit_overage_cents
     FROM partner_profiles pp
     LEFT JOIN partner_wholesale_plans w ON w.id = pp.wholesale_plan_id
     WHERE pp.partner_tenant_id = $1`,
    [partnerTenantId]
  );
  const wrow = wr.rows[0];
  if (wrow) {
    wholesalePlanId = wrow.wholesale_plan_id;
    wholesaleStatus = wrow.wholesale_status;
    if (wrow.unit_overage_cents != null && wrow.unit_overage_cents >= 0) {
      topupUnit = wrow.unit_overage_cents;
      topupSource = 'wholesale_overage';
    }
  }

  return {
    partner_tenant_id: partnerTenantId,
    purchased_seats: purchased,
    used_seats: used,
    available_seats: Math.max(0, purchased - used),
    unit_cost_cents: unit,
    topup_unit_price_cents: topupUnit,
    topup_price_source: topupSource,
    wholesale_status: wholesaleStatus,
    wholesale_plan_id: wholesalePlanId,
    floor_price_cents: floor,
    program_type: profile?.program_type ?? null,
  };
}

/**
 * Bloqueia criação de user no canal se pool esgotado.
 * Chamar antes de INSERT users em customer_tenant do Partner.
 */
export async function assertPartnerPoolAllowsNewUser(
  partnerTenantId: string,
  additionalUsers = 1
): Promise<void> {
  const { assertPartnerChannelGrowthAllowed } = await import('./partnerWholesaleStatusService.js');
  await assertPartnerChannelGrowthAllowed(partnerTenantId);

  const summary = await getPartnerLicenseSummary(partnerTenantId);
  if (summary.used_seats + additionalUsers > summary.purchased_seats) {
    throw new PartnerAdminError(
      `Pool de licenças esgotado (${summary.used_seats}/${summary.purchased_seats})`,
      'LICENSE_POOL_EXHAUSTED',
      409
    );
  }
}

export async function canPartnerSellWithGateway(partnerTenantId: string): Promise<{
  ok: boolean;
  reason: 'ok' | 'no_gateway' | 'inactive' | 'no_credentials';
}> {
  const { getTenantConfig } = await import('../services/paymentGatewayConfigService.js');
  const config = await getTenantConfig(partnerTenantId);
  if (!config) return { ok: false, reason: 'no_gateway' };
  if (config.gateway_key !== 'asaas') return { ok: false, reason: 'no_gateway' };
  if (!config.hasCredentials) return { ok: false, reason: 'no_credentials' };
  if (config.status && config.status !== 'active' && config.status !== 'pending') {
    // pending após save ainda permite teste; exigir active para vender
    if (config.status === 'disabled' || config.status === 'error') {
      return { ok: false, reason: 'inactive' };
    }
  }
  if (config.last_connection_status === 'auth_error') {
    return { ok: false, reason: 'inactive' };
  }
  // Para cobrar: preferir status active OU last_connection_status ok
  if (config.status === 'active' || config.last_connection_status === 'ok') {
    return { ok: true, reason: 'ok' };
  }
  // Configurado mas ainda não testado → permitir draft de planos, bloquear cobrança
  return { ok: false, reason: 'inactive' };
}
