/**
 * M5-W Sprint 4 + Block S3 — relatório operacional Super Admin.
 */

import { pool } from '../utils/db.js';
import {
  DEFAULT_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS,
  PARTNER_WHOLESALE_BLOCK_AFTER_DAYS_KEY,
} from './partnerWholesaleBlockSettingsService.js';

export type PartnerWholesaleReportRow = {
  partner_tenant_id: string;
  partner_name: string;
  partner_slug: string;
  public_name: string;
  partner_status: string;
  wholesale_status: string;
  wholesale_plan_id: string | null;
  wholesale_plan_name: string | null;
  seats_included: number | null;
  purchased_seats: number;
  used_seats: number;
  available_seats: number;
  wholesale_subscription_id: string | null;
  subscription_status: string | null;
  next_billing_date: string | null;
  wholesale_past_due_at: string | null;
  grant_source: string | null;
  wholesale_block_after_days: number | null;
  effective_block_after_days: number;
  block_days_source: 'override' | 'global';
};

export async function listPartnerWholesaleReport(opts?: {
  status?: string | null;
  limit?: number;
}): Promise<PartnerWholesaleReportRow[]> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 200));
  const status = opts?.status?.trim() || null;

  const r = await pool.query<{
    partner_tenant_id: string;
    partner_name: string;
    partner_slug: string;
    public_name: string;
    partner_status: string;
    wholesale_status: string;
    wholesale_plan_id: string | null;
    wholesale_plan_name: string | null;
    seats_included: number | null;
    purchased_seats: number;
    used_seats: number;
    wholesale_subscription_id: string | null;
    subscription_status: string | null;
    next_billing_date: string | null;
    wholesale_past_due_at: string | null;
    grant_source: string | null;
    wholesale_block_after_days: number | null;
    global_block_after_days: string | null;
  }>(
    `SELECT t.id::text AS partner_tenant_id,
            t.name AS partner_name,
            t.slug AS partner_slug,
            pp.public_name,
            pp.status AS partner_status,
            COALESCE(pp.wholesale_status, 'none') AS wholesale_status,
            pp.wholesale_plan_id::text,
            w.name AS wholesale_plan_name,
            w.seats_included,
            COALESCE(pl.purchased_seats, 0) AS purchased_seats,
            COALESCE(pl.used_seats_cache, 0) AS used_seats,
            pp.wholesale_subscription_id::text,
            s.status AS subscription_status,
            s.next_billing_date::text AS next_billing_date,
            pp.wholesale_past_due_at::text,
            pp.program_config_json->>'grant_source' AS grant_source,
            pp.wholesale_block_after_days,
            (
              SELECT ss.value FROM superadmin_settings ss
              WHERE ss.key = $3
              LIMIT 1
            ) AS global_block_after_days
     FROM partner_profiles pp
     JOIN tenants t ON t.id = pp.partner_tenant_id AND t.account_type = 'partner'
     LEFT JOIN partner_license_pool pl ON pl.partner_tenant_id = pp.partner_tenant_id
     LEFT JOIN partner_wholesale_plans w ON w.id = pp.wholesale_plan_id
     LEFT JOIN subscriptions s ON s.id = pp.wholesale_subscription_id
     WHERE ($1::text IS NULL OR COALESCE(pp.wholesale_status, 'none') = $1)
     ORDER BY
       CASE COALESCE(pp.wholesale_status, 'none')
         WHEN 'past_due' THEN 0
         WHEN 'active' THEN 1
         WHEN 'canceled' THEN 2
         ELSE 3
       END,
       pp.public_name ASC
     LIMIT $2`,
    [status, limit, PARTNER_WHOLESALE_BLOCK_AFTER_DAYS_KEY]
  );

  return r.rows.map((row) => {
    const globalRaw = row.global_block_after_days;
    const globalParsed =
      globalRaw != null && globalRaw !== ''
        ? Math.floor(Number(globalRaw))
        : DEFAULT_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS;
    const globalDays = Number.isFinite(globalParsed)
      ? Math.min(90, Math.max(0, globalParsed))
      : DEFAULT_PARTNER_WHOLESALE_BLOCK_AFTER_DAYS;
    const override =
      row.wholesale_block_after_days == null ? null : Number(row.wholesale_block_after_days);
    const hasOverride = override != null && Number.isFinite(override);
    return {
      ...row,
      wholesale_block_after_days: hasOverride ? override : null,
      effective_block_after_days: hasOverride ? override! : globalDays,
      block_days_source: hasOverride ? ('override' as const) : ('global' as const),
      available_seats: Math.max(0, Number(row.purchased_seats) - Number(row.used_seats)),
    };
  });
}
