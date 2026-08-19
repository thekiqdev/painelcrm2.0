/**
 * M5 Partner — repository (S1).
 */

import type { Pool, PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import type {
  PartnerDetail,
  PartnerLicensePoolRow,
  PartnerListItem,
  PartnerMembershipRole,
  PartnerMembershipRow,
  PartnerProfileRow,
} from './partnerTypes.js';

type Db = Pick<Pool | PoolClient, 'query'>;

function dbOf(client?: Db): Db {
  return client ?? pool;
}

function floorFromConfig(config: Record<string, unknown> | null | undefined): number | null {
  if (!config || typeof config !== 'object') return null;
  const v = config.floor_price_cents;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function findPartnerMembershipForUser(
  userId: string,
  options?: { db?: Db; roles?: PartnerMembershipRole[] }
): Promise<(PartnerMembershipRow & { partner_status: string }) | null> {
  const db = dbOf(options?.db);
  const roles = options?.roles ?? ['partner_admin', 'partner_seller'];
  const result = await db.query<PartnerMembershipRow & { partner_status: string }>(
    `SELECT m.id, m.partner_tenant_id, m.user_id, m.role, m.status, m.referral_code,
            m.created_at::text, m.updated_at::text,
            COALESCE(pp.status, 'active') AS partner_status
     FROM partner_memberships m
     JOIN tenants t ON t.id = m.partner_tenant_id AND t.account_type = 'partner'
     LEFT JOIN partner_profiles pp ON pp.partner_tenant_id = m.partner_tenant_id
     WHERE m.user_id = $1
       AND m.status = 'active'
       AND m.role = ANY($2::text[])
     ORDER BY CASE m.role WHEN 'partner_admin' THEN 0 ELSE 1 END
     LIMIT 1`,
    [userId, roles]
  );
  return result.rows[0] ?? null;
}

export async function getPartnerProfile(
  partnerTenantId: string,
  options?: { db?: Db }
): Promise<PartnerProfileRow | null> {
  const db = dbOf(options?.db);
  const result = await db.query<PartnerProfileRow>(
    `SELECT partner_tenant_id, program_type, program_config_json, public_name, product_name,
            custom_domain, domain_status, domain_verification_token, logo_url, theme_json,
            payout_cadence_preference, status,
            created_at::text, updated_at::text
     FROM partner_profiles
     WHERE partner_tenant_id = $1`,
    [partnerTenantId]
  );
  return result.rows[0] ?? null;
}

export async function getPartnerLicensePool(
  partnerTenantId: string,
  options?: { db?: Db }
): Promise<PartnerLicensePoolRow | null> {
  const db = dbOf(options?.db);
  const result = await db.query<PartnerLicensePoolRow>(
    `SELECT partner_tenant_id, purchased_seats, unit_cost_cents, used_seats_cache,
            updated_at::text
     FROM partner_license_pool
     WHERE partner_tenant_id = $1`,
    [partnerTenantId]
  );
  return result.rows[0] ?? null;
}

export async function listPartners(options?: { db?: Db }): Promise<PartnerListItem[]> {
  const db = dbOf(options?.db);
  const result = await db.query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    account_type: string;
    created_at: string;
    public_name: string;
    product_name: string;
    program_type: string;
    partner_status: string;
    purchased_seats: number;
    used_seats_cache: number;
    unit_cost_cents: number;
    program_config_json: Record<string, unknown>;
    admin_email: string | null;
  }>(
    `SELECT t.id, t.name, t.slug, t.status, t.account_type, t.created_at::text,
            pp.public_name, pp.product_name, pp.program_type, pp.status AS partner_status,
            pp.program_config_json,
            COALESCE(pl.purchased_seats, 0) AS purchased_seats,
            COALESCE(pl.used_seats_cache, 0) AS used_seats_cache,
            COALESCE(pl.unit_cost_cents, 0) AS unit_cost_cents,
            (
              SELECT u.email FROM partner_memberships m
              JOIN users u ON u.id = m.user_id
              WHERE m.partner_tenant_id = t.id AND m.role = 'partner_admin' AND m.status = 'active'
              ORDER BY m.created_at ASC
              LIMIT 1
            ) AS admin_email
     FROM tenants t
     JOIN partner_profiles pp ON pp.partner_tenant_id = t.id
     LEFT JOIN partner_license_pool pl ON pl.partner_tenant_id = t.id
     WHERE t.account_type = 'partner'
     ORDER BY t.created_at DESC`
  );

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    account_type: 'partner',
    created_at: r.created_at,
    public_name: r.public_name,
    product_name: r.product_name,
    program_type: r.program_type as PartnerListItem['program_type'],
    partner_status: r.partner_status as PartnerListItem['partner_status'],
    purchased_seats: r.purchased_seats,
    used_seats_cache: r.used_seats_cache,
    unit_cost_cents: r.unit_cost_cents,
    floor_price_cents: floorFromConfig(r.program_config_json),
    admin_email: r.admin_email,
  }));
}

export async function getPartnerDetail(
  partnerTenantId: string,
  options?: { db?: Db }
): Promise<PartnerDetail | null> {
  const db = dbOf(options?.db);
  const result = await db.query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    account_type: string;
    created_at: string;
    plan_id: string;
    domain: string | null;
    public_name: string;
    product_name: string;
    program_type: string;
    partner_status: string;
    program_config_json: Record<string, unknown>;
    logo_url: string | null;
    theme_json: Record<string, unknown>;
    custom_domain: string | null;
    domain_status: string;
    payout_cadence_preference: string;
    purchased_seats: number;
    used_seats_cache: number;
    unit_cost_cents: number;
    admin_email: string | null;
  }>(
    `SELECT t.id, t.name, t.slug, t.status, t.account_type, t.created_at::text,
            t.plan_id, t.domain,
            pp.public_name, pp.product_name, pp.program_type, pp.status AS partner_status,
            pp.program_config_json, pp.logo_url, pp.theme_json,
            pp.custom_domain, pp.domain_status, pp.payout_cadence_preference,
            COALESCE(pl.purchased_seats, 0) AS purchased_seats,
            COALESCE(pl.used_seats_cache, 0) AS used_seats_cache,
            COALESCE(pl.unit_cost_cents, 0) AS unit_cost_cents,
            (
              SELECT u.email FROM partner_memberships m
              JOIN users u ON u.id = m.user_id
              WHERE m.partner_tenant_id = t.id AND m.role = 'partner_admin' AND m.status = 'active'
              ORDER BY m.created_at ASC
              LIMIT 1
            ) AS admin_email
     FROM tenants t
     JOIN partner_profiles pp ON pp.partner_tenant_id = t.id
     LEFT JOIN partner_license_pool pl ON pl.partner_tenant_id = t.id
     WHERE t.id = $1 AND t.account_type = 'partner'`,
    [partnerTenantId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const memberships = await db.query<{
    id: string;
    user_id: string;
    role: PartnerMembershipRole;
    status: string;
    email: string | null;
    referral_code: string | null;
  }>(
    `SELECT m.id, m.user_id, m.role, m.status, u.email, m.referral_code
     FROM partner_memberships m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.partner_tenant_id = $1
     ORDER BY m.created_at ASC`,
    [partnerTenantId]
  );

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    account_type: 'partner',
    created_at: row.created_at,
    plan_id: row.plan_id,
    domain: row.domain,
    public_name: row.public_name,
    product_name: row.product_name,
    program_type: row.program_type as PartnerDetail['program_type'],
    partner_status: row.partner_status as PartnerDetail['partner_status'],
    purchased_seats: row.purchased_seats,
    used_seats_cache: row.used_seats_cache,
    unit_cost_cents: row.unit_cost_cents,
    floor_price_cents: floorFromConfig(row.program_config_json),
    admin_email: row.admin_email,
    program_config_json: row.program_config_json ?? {},
    logo_url: row.logo_url,
    theme_json: row.theme_json ?? {},
    custom_domain: row.custom_domain,
    domain_status: row.domain_status as PartnerDetail['domain_status'],
    payout_cadence_preference: row.payout_cadence_preference as PartnerDetail['payout_cadence_preference'],
    memberships: memberships.rows,
  };
}

export async function resolveDefaultPlanId(options?: { db?: Db }): Promise<string | null> {
  const db = dbOf(options?.db);
  const result = await db.query<{ id: string }>(
    `SELECT id FROM plans
     WHERE COALESCE(is_active, true) = true
     ORDER BY CASE WHEN plan_type = 'standard' THEN 0 ELSE 1 END, created_at ASC
     LIMIT 1`
  );
  return result.rows[0]?.id ?? null;
}

export async function slugExists(slug: string, options?: { db?: Db }): Promise<boolean> {
  const db = dbOf(options?.db);
  const result = await db.query(`SELECT 1 FROM tenants WHERE slug = $1 LIMIT 1`, [slug]);
  return result.rows.length > 0;
}
