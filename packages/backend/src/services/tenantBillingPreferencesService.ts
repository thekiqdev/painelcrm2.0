import { pool } from '../utils/db.js';

export const BILLING_PREFERENCES_DEFAULTS = {
  timezone: 'America/Sao_Paulo',
  recurring_generate_time_local: '09:00',
  invoice_notify_same_as_generation: true,
} as const;

export interface TenantBillingPreferencesRow {
  timezone: string | null;
  recurring_generate_time_local: string | null;
  invoice_notify_same_as_generation: boolean | null;
  invoice_notify_time_local: string | null;
}

export interface TenantBillingPreferencesResolved {
  timezone_effective: string;
  timezone_source: 'tenant' | 'fallback_default';
  timezone_valid: boolean;
  recurring_generate_time_local_effective: string;
  recurring_generate_time_source: 'tenant' | 'fallback_default';
  invoice_notify_same_as_generation_effective: boolean;
  invoice_notify_same_as_generation_source: 'tenant' | 'fallback_default';
  invoice_notify_time_local_effective: string | null;
  invoice_notify_time_source: 'tenant' | 'derived_from_generation' | 'fallback_default';
}

export function normalizeTimeToHhMm(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.trim();
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTenantBillingPreferences(
  raw: TenantBillingPreferencesRow | null | undefined
): TenantBillingPreferencesResolved {
  const tzRaw = raw?.timezone?.trim() || null;
  const timezone_valid = tzRaw ? isValidIanaTimezone(tzRaw) : false;
  const timezone_effective = timezone_valid ? tzRaw! : BILLING_PREFERENCES_DEFAULTS.timezone;
  const timezone_source: 'tenant' | 'fallback_default' = timezone_valid ? 'tenant' : 'fallback_default';

  const recurringRaw = normalizeTimeToHhMm(raw?.recurring_generate_time_local ?? null);
  const recurring_generate_time_local_effective =
    recurringRaw ?? BILLING_PREFERENCES_DEFAULTS.recurring_generate_time_local;
  const recurring_generate_time_source: 'tenant' | 'fallback_default' = recurringRaw
    ? 'tenant'
    : 'fallback_default';

  const same =
    typeof raw?.invoice_notify_same_as_generation === 'boolean'
      ? raw.invoice_notify_same_as_generation
      : BILLING_PREFERENCES_DEFAULTS.invoice_notify_same_as_generation;
  const invoice_notify_same_as_generation_source: 'tenant' | 'fallback_default' =
    typeof raw?.invoice_notify_same_as_generation === 'boolean' ? 'tenant' : 'fallback_default';

  const notifyRaw = normalizeTimeToHhMm(raw?.invoice_notify_time_local ?? null);
  let invoice_notify_time_local_effective: string | null = null;
  let invoice_notify_time_source: 'tenant' | 'derived_from_generation' | 'fallback_default' = 'fallback_default';

  if (same) {
    invoice_notify_time_local_effective = recurring_generate_time_local_effective;
    invoice_notify_time_source = 'derived_from_generation';
  } else if (notifyRaw) {
    invoice_notify_time_local_effective = notifyRaw;
    invoice_notify_time_source = 'tenant';
  } else {
    invoice_notify_time_local_effective = null;
    invoice_notify_time_source = 'fallback_default';
  }

  return {
    timezone_effective,
    timezone_source,
    timezone_valid,
    recurring_generate_time_local_effective,
    recurring_generate_time_source,
    invoice_notify_same_as_generation_effective: same,
    invoice_notify_same_as_generation_source,
    invoice_notify_time_local_effective,
    invoice_notify_time_source,
  };
}

export async function getTenantBillingPreferences(tenantId: string): Promise<TenantBillingPreferencesRow | null> {
  const r = await pool.query<TenantBillingPreferencesRow>(
    `SELECT timezone::text,
            recurring_generate_time_local::text,
            invoice_notify_same_as_generation,
            invoice_notify_time_local::text
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId]
  );
  return r.rows[0] ?? null;
}

export async function updateTenantBillingPreferences(
  tenantId: string,
  data: {
    timezone: string | null;
    recurring_generate_time_local: string;
    invoice_notify_same_as_generation: boolean;
    invoice_notify_time_local: string | null;
  }
): Promise<TenantBillingPreferencesRow | null> {
  const recurring = normalizeTimeToHhMm(data.recurring_generate_time_local);
  const notify = normalizeTimeToHhMm(data.invoice_notify_time_local);
  const r = await pool.query<TenantBillingPreferencesRow>(
    `UPDATE tenants
     SET timezone = $1::text,
         recurring_generate_time_local = $2::time,
         invoice_notify_same_as_generation = $3::boolean,
         invoice_notify_time_local = $4::time,
         updated_at = now()
     WHERE id = $5
     RETURNING timezone::text, recurring_generate_time_local::text,
               invoice_notify_same_as_generation, invoice_notify_time_local::text`,
    [data.timezone, recurring, data.invoice_notify_same_as_generation, data.invoice_notify_same_as_generation ? null : notify, tenantId]
  );
  return r.rows[0] ?? null;
}

