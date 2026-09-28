/**
 * M5 S6 — suspender Partner e migrar customer_tenants para Platform (D15).
 * Preserva preço via tenant_commercial_overrides.fixed_price.
 */

import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { logSuperAdminAction } from '../services/auditLogService.js';
import { PartnerAdminError } from './partnerAdminService.js';
import { getPartnerDetail } from './partnerRepository.js';
import type { TenantCommercialBillingInterval } from '../commercial/tenantCommercialTypes.js';

export type PartnerChannelStats = {
  partners_active: number;
  partners_suspended: number;
  customer_tenants: number;
  platform_customers: number;
  migrated_from_channel: number;
  seats_purchased_total: number;
  seats_used_total: number;
};

export type SuspendMigrationResult = {
  partner_tenant_id: string;
  already_suspended: boolean;
  customers_migrated: number;
  customers_skipped: number;
  price_overrides_created: number;
  event_id: string;
  migrated_tenant_ids: string[];
};

const INTERVALS = new Set([
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'yearly',
  'semiannual',
]);

function normalizeInterval(raw: string | null | undefined): TenantCommercialBillingInterval | null {
  if (!raw) return null;
  let v = String(raw).trim().toLowerCase();
  if (v === 'semiannual') v = 'semi_annual';
  if (!INTERVALS.has(v)) return 'monthly';
  return v as TenantCommercialBillingInterval;
}

async function resolveContractedPrice(
  client: PoolClient,
  tenantId: string,
  planId: string | null
): Promise<{ amountCents: number; billingInterval: TenantCommercialBillingInterval | null }> {
  const sub = await client.query<{
    amount_cents: number | null;
    contracted_plan_price_cents: number | null;
    billing_interval: string | null;
  }>(
    `SELECT amount_cents, contracted_plan_price_cents, billing_interval
     FROM subscriptions
     WHERE tenant_id = $1
       AND type = 'saas'
       AND status IN ('active', 'trialing', 'past_due', 'paused')
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [tenantId]
  );
  const s = sub.rows[0];
  if (s) {
    const amount =
      (s.contracted_plan_price_cents != null && s.contracted_plan_price_cents > 0
        ? s.contracted_plan_price_cents
        : null) ??
      (s.amount_cents != null && s.amount_cents > 0 ? s.amount_cents : null);
    if (amount != null) {
      return {
        amountCents: amount,
        billingInterval: normalizeInterval(s.billing_interval),
      };
    }
  }

  const bill = await client.query<{
    amount_cents: number;
    billing_interval: string | null;
  }>(
    `SELECT amount_cents, billing_interval
     FROM tenant_billing
     WHERE tenant_id = $1 AND status = 'paid' AND amount_cents > 0
     ORDER BY COALESCE(paid_at, updated_at) DESC NULLS LAST
     LIMIT 1`,
    [tenantId]
  );
  if (bill.rows[0]) {
    return {
      amountCents: bill.rows[0].amount_cents,
      billingInterval: normalizeInterval(bill.rows[0].billing_interval),
    };
  }

  if (planId) {
    const plan = await client.query<{ price_cents: number | null }>(
      `SELECT price_cents FROM plans WHERE id = $1 LIMIT 1`,
      [planId]
    );
    if (plan.rows[0]?.price_cents != null && plan.rows[0].price_cents >= 0) {
      return { amountCents: plan.rows[0].price_cents, billingInterval: 'monthly' };
    }
  }

  return { amountCents: 0, billingInterval: 'monthly' };
}

export async function getPartnerChannelStats(): Promise<PartnerChannelStats> {
  const r = await pool.query<{
    partners_active: string;
    partners_suspended: string;
    customer_tenants: string;
    platform_customers: string;
    migrated_from_channel: string;
    seats_purchased_total: string;
    seats_used_total: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM partner_profiles WHERE status = 'active') AS partners_active,
       (SELECT COUNT(*)::text FROM partner_profiles WHERE status = 'suspended') AS partners_suspended,
       (SELECT COUNT(*)::text FROM tenants WHERE account_type = 'customer_tenant') AS customer_tenants,
       (SELECT COUNT(*)::text FROM tenants WHERE account_type = 'platform_customer') AS platform_customers,
       (SELECT COUNT(*)::text FROM tenants WHERE migrated_from_partner_id IS NOT NULL) AS migrated_from_channel,
       (SELECT COALESCE(SUM(purchased_seats), 0)::text FROM partner_license_pool) AS seats_purchased_total,
       (SELECT COALESCE(SUM(used_seats_cache), 0)::text FROM partner_license_pool) AS seats_used_total`
  );
  const row = r.rows[0];
  return {
    partners_active: parseInt(row?.partners_active || '0', 10) || 0,
    partners_suspended: parseInt(row?.partners_suspended || '0', 10) || 0,
    customer_tenants: parseInt(row?.customer_tenants || '0', 10) || 0,
    platform_customers: parseInt(row?.platform_customers || '0', 10) || 0,
    migrated_from_channel: parseInt(row?.migrated_from_channel || '0', 10) || 0,
    seats_purchased_total: parseInt(row?.seats_purchased_total || '0', 10) || 0,
    seats_used_total: parseInt(row?.seats_used_total || '0', 10) || 0,
  };
}

/**
 * Suspende Partner e migra clientes para Platform preservando preço (D15).
 * Idempotente: clientes já migrados são skip; reexecução processa restantes.
 */
export async function suspendPartnerAndMigrateCustomers(
  partnerTenantId: string,
  opts: { actorUserId?: string | null; reason?: string | null } = {}
): Promise<SuspendMigrationResult> {
  const detail = await getPartnerDetail(partnerTenantId);
  if (!detail) {
    throw new PartnerAdminError('Partner não encontrado', 'NOT_FOUND', 404);
  }

  const alreadySuspended = detail.partner_status === 'suspended';
  const client = await pool.connect();
  const migratedIds: string[] = [];
  let migrated = 0;
  let skipped = 0;
  let overrides = 0;

  try {
    await client.query('BEGIN');

    const priorMigrated = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM tenants
       WHERE migrated_from_partner_id = $1 AND account_type = 'platform_customer'`,
      [partnerTenantId]
    );
    skipped = parseInt(priorMigrated.rows[0]?.c || '0', 10) || 0;

    const customers = await client.query<{
      id: string;
      plan_id: string | null;
      account_type: string;
    }>(
      `SELECT id, plan_id::text AS plan_id, account_type
       FROM tenants
       WHERE partner_id = $1 AND account_type = 'customer_tenant'
       ORDER BY created_at ASC
       FOR UPDATE`,
      [partnerTenantId]
    );

    for (const cust of customers.rows) {
      const price = await resolveContractedPrice(client, cust.id, cust.plan_id);

      // Override fixed_price para renovação futura na Platform
      if (price.amountCents >= 0) {
        await client.query(
          `UPDATE tenant_commercial_overrides
           SET is_active = false, updated_at = now()
           WHERE tenant_id = $1 AND is_active = true
             AND override_type = 'fixed_price'
             AND COALESCE(metadata_json->>'source', '') = 'partner_migration_d15'`,
          [cust.id]
        );

        await client.query(
          `INSERT INTO tenant_commercial_overrides (
             tenant_id, plan_id, billing_interval, override_type,
             value_cents, reason, metadata_json, created_by, is_active
           ) VALUES (
             $1, $2, $3, 'fixed_price', $4,
             $5, $6::jsonb, $7, true
           )`,
          [
            cust.id,
            cust.plan_id,
            price.billingInterval,
            price.amountCents,
            `Migração D15 do Partner ${detail.public_name || partnerTenantId}`,
            JSON.stringify({
              source: 'partner_migration_d15',
              from_partner_id: partnerTenantId,
              preserved_amount_cents: price.amountCents,
              billing_interval: price.billingInterval,
            }),
            opts.actorUserId ?? null,
          ]
        );
        overrides += 1;

        // Congela snapshot na assinatura ativa, se existir
        await client.query(
          `UPDATE subscriptions
           SET contracted_plan_price_cents = COALESCE(contracted_plan_price_cents, $1),
               amount_cents = CASE
                 WHEN amount_cents IS NULL OR amount_cents = 0 THEN $1
                 ELSE amount_cents
               END,
               updated_at = now()
           WHERE tenant_id = $2
             AND type = 'saas'
             AND status IN ('active', 'trialing', 'past_due', 'paused')`,
          [price.amountCents, cust.id]
        );
      }

      await client.query(
        `UPDATE tenants
         SET account_type = 'platform_customer',
             partner_id = NULL,
             seller_user_id = NULL,
             migrated_from_partner_id = $1,
             partner_migrated_at = now(),
             updated_at = now()
         WHERE id = $2`,
        [partnerTenantId, cust.id]
      );

      migrated += 1;
      migratedIds.push(cust.id);
    }

    await client.query(
      `UPDATE partner_profiles
       SET status = 'suspended', updated_at = now()
       WHERE partner_tenant_id = $1`,
      [partnerTenantId]
    );

    // Bloqueia venda: arquiva planos ativos
    await client.query(
      `UPDATE partner_sell_plans
       SET status = 'archived', updated_at = now()
       WHERE partner_tenant_id = $1 AND status = 'active'`,
      [partnerTenantId]
    );

    // Domínio deixa de servir WL (brand resolver exige status active)
    await client.query(
      `UPDATE partner_profiles
       SET domain_status = CASE
             WHEN domain_status IN ('verified', 'active') THEN 'pending'
             ELSE domain_status
           END,
           updated_at = now()
       WHERE partner_tenant_id = $1`,
      [partnerTenantId]
    );

    const event = await client.query<{ id: string }>(
      `INSERT INTO partner_suspension_events (
         partner_tenant_id, actor_user_id, reason,
         customers_migrated, customers_skipped, price_overrides_created, result_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id`,
      [
        partnerTenantId,
        opts.actorUserId ?? null,
        opts.reason?.trim() || null,
        migrated,
        skipped,
        overrides,
        JSON.stringify({
          already_suspended: alreadySuspended,
          migrated_tenant_ids: migratedIds,
        }),
      ]
    );

    await client.query('COMMIT');

    if (opts.actorUserId) {
      await logSuperAdminAction(
        opts.actorUserId,
        'partner.suspended_migrated',
        'tenant',
        partnerTenantId,
        {
          customers_migrated: migrated,
          price_overrides_created: overrides,
          reason: opts.reason ?? null,
        }
      );
    }

    return {
      partner_tenant_id: partnerTenantId,
      already_suspended: alreadySuspended,
      customers_migrated: migrated,
      customers_skipped: skipped,
      price_overrides_created: overrides,
      event_id: event.rows[0]!.id,
      migrated_tenant_ids: migratedIds,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listPartnerSuspensionEvents(
  partnerTenantId: string
): Promise<
  Array<{
    id: string;
    reason: string | null;
    customers_migrated: number;
    customers_skipped: number;
    price_overrides_created: number;
    created_at: string;
  }>
> {
  const r = await pool.query(
    `SELECT id, reason, customers_migrated, customers_skipped, price_overrides_created,
            created_at::text AS created_at
     FROM partner_suspension_events
     WHERE partner_tenant_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [partnerTenantId]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    reason: row.reason != null ? String(row.reason) : null,
    customers_migrated: Number(row.customers_migrated) || 0,
    customers_skipped: Number(row.customers_skipped) || 0,
    price_overrides_created: Number(row.price_overrides_created) || 0,
    created_at: String(row.created_at),
  }));
}
