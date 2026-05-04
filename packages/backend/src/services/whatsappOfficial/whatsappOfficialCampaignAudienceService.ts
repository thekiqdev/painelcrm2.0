import { pool } from '../../utils/db.js';
import { normalizePhoneE164Digits, type CsvCampaignRow } from './whatsappOfficialCampaignCsv.js';

/** Segmentação de tenants (Super Admin). */
export type TenantAudienceFilters = {
  /** Atalho: apenas `tenants.status = active` */
  active_only?: boolean;
  plan_ids?: string[];
  /** Valores: active | trial | suspended | overdue (overdue via último tenant_billing) */
  statuses?: string[];
  created_from?: string | null;
  created_to?: string | null;
};

export type TenantAudienceRow = {
  tenant_id: string;
  tenant_name: string;
  phone_digits: string;
  raw_payload: Record<string, unknown>;
};

/**
 * Telefone principal: primeiro utilizador do tenant com WhatsApp válido (10+ dígitos).
 */
export async function resolveTenantAudienceRows(filters: TenantAudienceFilters): Promise<TenantAudienceRow[]> {
  const planIds = filters.plan_ids?.filter(Boolean) ?? [];
  const rawStatuses = filters.statuses?.filter(Boolean) ?? [];
  const wantOverdue = rawStatuses.includes('overdue');
  const tenantStatuses = rawStatuses.filter((s) => s !== 'overdue');

  const params: unknown[] = [];
  let p = 1;

  let sql = `
    SELECT t.id::text AS tenant_id,
           t.name AS tenant_name,
           pl.name AS plan_name,
           t.status AS tenant_status,
           tb.status AS billing_status,
           NULLIF(regexp_replace(COALESCE(pr.whatsapp_number, u.whatsapp_number, ''), '\\D', '', 'g'), '') AS phone_digits
    FROM tenants t
    INNER JOIN plans pl ON pl.id = t.plan_id
    LEFT JOIN LATERAL (
      SELECT tb2.status
      FROM tenant_billing tb2
      WHERE tb2.tenant_id = t.id
      ORDER BY tb2.created_at DESC NULLS LAST
      LIMIT 1
    ) tb ON true
    INNER JOIN LATERAL (
      SELECT us.id, us.whatsapp_number
      FROM users us
      LEFT JOIN profiles pr2 ON pr2.id = us.id
      WHERE us.tenant_id = t.id
        AND length(regexp_replace(COALESCE(pr2.whatsapp_number, us.whatsapp_number, ''), '\\D', '', 'g')) >= 10
      ORDER BY us.created_at ASC
      LIMIT 1
    ) u ON true
    LEFT JOIN profiles pr ON pr.id = u.id
    WHERE 1=1
  `;

  if (filters.active_only === true) {
    sql += ` AND t.status = 'active'`;
  } else if (tenantStatuses.length > 0 || wantOverdue) {
    const orParts: string[] = [];
    if (tenantStatuses.length > 0) {
      orParts.push(`t.status = ANY($${p}::text[])`);
      params.push(tenantStatuses);
      p += 1;
    }
    if (wantOverdue) {
      orParts.push(`tb.status = 'overdue'`);
    }
    if (orParts.length > 0) {
      sql += ` AND (${orParts.join(' OR ')})`;
    }
  }

  if (planIds.length > 0) {
    sql += ` AND t.plan_id = ANY($${p}::uuid[])`;
    params.push(planIds);
    p += 1;
  }

  if (filters.created_from) {
    sql += ` AND t.created_at >= $${p}::timestamptz`;
    params.push(filters.created_from);
    p += 1;
  }
  if (filters.created_to) {
    sql += ` AND t.created_at <= $${p}::timestamptz`;
    params.push(filters.created_to);
    p += 1;
  }

  const r = await pool.query<{
    tenant_id: string;
    tenant_name: string;
    plan_name: string;
    tenant_status: string;
    billing_status: string | null;
    phone_digits: string | null;
  }>(sql, params);

  const out: TenantAudienceRow[] = [];
  const seen = new Set<string>();
  for (const row of r.rows) {
    const d = row.phone_digits ? normalizePhoneE164Digits(row.phone_digits) : null;
    if (!d || d.length < 12) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push({
      tenant_id: row.tenant_id,
      tenant_name: row.tenant_name,
      phone_digits: d,
      raw_payload: {
        name: row.tenant_name,
        company: row.tenant_name,
        plan: row.plan_name,
        status: row.tenant_status,
        billing_status: row.billing_status,
        phone: d,
      },
    });
  }
  return out;
}

export function csvRowsToPayload(rows: CsvCampaignRow[]): TenantAudienceRow[] {
  const out: TenantAudienceRow[] = [];
  for (const r of rows) {
    const d = normalizePhoneE164Digits(r.phone_raw);
    if (!d) continue;
    out.push({
      tenant_id: '',
      tenant_name: r.name || d,
      phone_digits: d,
      raw_payload: {
        name: r.name,
        email: r.email ?? null,
        phone: d,
        var1: r.var1 ?? null,
        var2: r.var2 ?? null,
        var3: r.var3 ?? null,
      },
    });
  }
  return out;
}
