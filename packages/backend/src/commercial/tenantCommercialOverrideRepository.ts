import { pool } from '../utils/db.js';
import type {
  TenantCommercialBillingInterval,
  TenantCommercialOverrideRow,
  TenantCommercialOverrideType,
} from './tenantCommercialTypes.js';
import { TENANT_COMMERCIAL_OVERRIDE_TYPES } from './tenantCommercialTypes.js';

function mapRow(row: Record<string, unknown>): TenantCommercialOverrideRow {
  const overrideType = String(row.override_type) as TenantCommercialOverrideType;
  if (!TENANT_COMMERCIAL_OVERRIDE_TYPES.includes(overrideType)) {
    throw new Error(`override_type inválido: ${overrideType}`);
  }
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    plan_id: row.plan_id != null ? String(row.plan_id) : null,
    billing_interval:
      row.billing_interval != null ? (String(row.billing_interval) as TenantCommercialBillingInterval) : null,
    override_type: overrideType,
    value_cents: row.value_cents != null ? Number(row.value_cents) : null,
    percent_off: row.percent_off != null ? Number(row.percent_off) : null,
    valid_from: row.valid_from as Date | string,
    valid_until: row.valid_until != null ? (row.valid_until as Date | string) : null,
    reason: row.reason != null ? String(row.reason) : null,
    metadata_json: (row.metadata_json as Record<string, unknown> | null) ?? null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    is_active: row.is_active === true,
    created_at: row.created_at as Date | string,
    updated_at: row.updated_at as Date | string,
  };
}

/**
 * Candidatos ativos para o tenant no instante `at` (filtro SQL + escopo plano/intervalo).
 */
export async function findActiveCommercialOverrideCandidates(input: {
  tenantId: string;
  planId: string;
  billingInterval: TenantCommercialBillingInterval;
  at?: Date;
}): Promise<TenantCommercialOverrideRow[]> {
  const at = input.at ?? new Date();
  const r = await pool.query(
    `SELECT id, tenant_id, plan_id, billing_interval, override_type,
            value_cents, percent_off, valid_from, valid_until, reason,
            metadata_json, created_by, is_active, created_at, updated_at
     FROM tenant_commercial_overrides
     WHERE tenant_id = $1::uuid
       AND is_active = true
       AND valid_from <= $2::timestamptz
       AND (valid_until IS NULL OR valid_until > $2::timestamptz)
       AND (plan_id IS NULL OR plan_id = $3::uuid)
       AND (billing_interval IS NULL OR billing_interval = $4)
     ORDER BY created_at DESC`,
    [input.tenantId, at, input.planId, input.billingInterval],
  );
  return r.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function listCommercialOverridesForTenant(tenantId: string): Promise<TenantCommercialOverrideRow[]> {
  const r = await pool.query(
    `SELECT o.id, o.tenant_id, o.plan_id, o.billing_interval, o.override_type,
            o.value_cents, o.percent_off, o.valid_from, o.valid_until, o.reason,
            o.metadata_json, o.created_by, o.is_active, o.created_at, o.updated_at,
            u.email AS created_by_email
     FROM tenant_commercial_overrides o
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.tenant_id = $1::uuid
     ORDER BY o.created_at DESC`,
    [tenantId],
  );
  return r.rows.map((row) => {
    const mapped = mapRow(row as Record<string, unknown>);
    const email = row.created_by_email != null ? String(row.created_by_email) : null;
    return {
      ...mapped,
      metadata_json: {
        ...(mapped.metadata_json ?? {}),
        created_by_email: email,
      },
    };
  });
}

export async function findCommercialOverrideById(
  tenantId: string,
  overrideId: string,
): Promise<TenantCommercialOverrideRow | null> {
  const r = await pool.query(
    `SELECT id, tenant_id, plan_id, billing_interval, override_type,
            value_cents, percent_off, valid_from, valid_until, reason,
            metadata_json, created_by, is_active, created_at, updated_at
     FROM tenant_commercial_overrides
     WHERE tenant_id = $1::uuid AND id = $2::uuid
     LIMIT 1`,
    [tenantId, overrideId],
  );
  const row = r.rows[0];
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function insertCommercialOverride(input: {
  tenantId: string;
  planId: string | null;
  billingInterval: TenantCommercialBillingInterval | null;
  overrideType: TenantCommercialOverrideType;
  valueCents: number | null;
  percentOff: number | null;
  validFrom: Date;
  validUntil: Date | null;
  reason: string | null;
  createdBy: string | null;
}): Promise<TenantCommercialOverrideRow> {
  const r = await pool.query(
    `INSERT INTO tenant_commercial_overrides (
       tenant_id, plan_id, billing_interval, override_type,
       value_cents, percent_off, valid_from, valid_until, reason, created_by
     ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10::uuid)
     RETURNING id, tenant_id, plan_id, billing_interval, override_type,
               value_cents, percent_off, valid_from, valid_until, reason,
               metadata_json, created_by, is_active, created_at, updated_at`,
    [
      input.tenantId,
      input.planId,
      input.billingInterval,
      input.overrideType,
      input.valueCents,
      input.percentOff,
      input.validFrom,
      input.validUntil,
      input.reason,
      input.createdBy,
    ],
  );
  return mapRow(r.rows[0] as Record<string, unknown>);
}

export async function updateCommercialOverride(input: {
  tenantId: string;
  overrideId: string;
  planId: string | null;
  billingInterval: TenantCommercialBillingInterval | null;
  overrideType: TenantCommercialOverrideType;
  valueCents: number | null;
  percentOff: number | null;
  validFrom: Date;
  validUntil: Date | null;
  reason: string | null;
}): Promise<TenantCommercialOverrideRow | null> {
  const r = await pool.query(
    `UPDATE tenant_commercial_overrides
     SET plan_id = $3::uuid,
         billing_interval = $4,
         override_type = $5,
         value_cents = $6,
         percent_off = $7,
         valid_from = $8::timestamptz,
         valid_until = $9::timestamptz,
         reason = $10,
         updated_at = now()
     WHERE tenant_id = $1::uuid AND id = $2::uuid
     RETURNING id, tenant_id, plan_id, billing_interval, override_type,
               value_cents, percent_off, valid_from, valid_until, reason,
               metadata_json, created_by, is_active, created_at, updated_at`,
    [
      input.tenantId,
      input.overrideId,
      input.planId,
      input.billingInterval,
      input.overrideType,
      input.valueCents,
      input.percentOff,
      input.validFrom,
      input.validUntil,
      input.reason,
    ],
  );
  const row = r.rows[0];
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function disableCommercialOverride(
  tenantId: string,
  overrideId: string,
): Promise<TenantCommercialOverrideRow | null> {
  const r = await pool.query(
    `UPDATE tenant_commercial_overrides
     SET is_active = false, updated_at = now()
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND is_active = true
     RETURNING id, tenant_id, plan_id, billing_interval, override_type,
               value_cents, percent_off, valid_from, valid_until, reason,
               metadata_json, created_by, is_active, created_at, updated_at`,
    [tenantId, overrideId],
  );
  const row = r.rows[0];
  return row ? mapRow(row as Record<string, unknown>) : null;
}
