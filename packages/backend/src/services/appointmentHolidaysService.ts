import { DateTime } from 'luxon';
import { pool } from '../utils/db.js';

export type HolidayRow = {
  id: string;
  tenant_id: string | null;
  name: string;
  holiday_date: string;
  scope: 'global' | 'tenant';
  country_code: string | null;
  state_code: string | null;
  city: string | null;
  is_recurring_yearly: boolean;
  blocks_availability: boolean;
  source: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Data civil efetiva (yyyy-MM-dd). Recorrentes usam mês/dia com o ano pedido. */
export function effectiveHolidayDisplayDate(row: HolidayRow, calendarYear: number): string {
  const raw = row.holiday_date.includes('T') ? row.holiday_date.slice(0, 10) : row.holiday_date;
  const parts = raw.split('-');
  const yStored = parseInt(parts[0]!, 10);
  const m = parseInt(parts[1]!, 10);
  const d = parseInt(parts[2]!, 10);
  if (!row.is_recurring_yearly) {
    return `${String(yStored).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return `${calendarYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function holidayMatchesTenantFilters(row: HolidayRow, opts: { countryCode: string }): boolean {
  if (row.scope === 'tenant') return true;
  if (row.country_code && opts.countryCode && row.country_code !== opts.countryCode) return false;
  return true;
}

export async function loadHolidaysApplicableForBlocking(params: {
  tenantId: string;
  countryCode: string;
}): Promise<HolidayRow[]> {
  const r = await pool.query<HolidayRow>(
    `SELECT id, tenant_id, name, holiday_date::text AS holiday_date, scope, country_code, state_code, city,
            is_recurring_yearly, blocks_availability, source, is_active, created_by, created_at, updated_at
     FROM public.appointment_holidays
     WHERE is_active AND blocks_availability
       AND (
         (scope = 'global' AND (country_code IS NULL OR country_code = $2))
         OR (scope = 'tenant' AND tenant_id = $1)
       )`,
    [params.tenantId, params.countryCode],
  );
  return r.rows;
}

export async function buildHolidayBlockedLocalDateSet(params: {
  tenantId: string;
  timezone: string;
  countryCode: string;
  blockHolidays: boolean;
  rangeStartLocal: DateTime;
  rangeEndLocal: DateTime;
}): Promise<{ blockedDates: Set<string>; firstBlocking?: { date: string; name: string } }> {
  const blockedDates = new Set<string>();
  if (!params.blockHolidays) {
    return { blockedDates };
  }
  const rows = await loadHolidaysApplicableForBlocking({
    tenantId: params.tenantId,
    countryCode: params.countryCode || 'BR',
  });

  let firstBlocking: { date: string; name: string } | undefined;
  let d = params.rangeStartLocal.startOf('day');
  const end = params.rangeEndLocal.startOf('day');
  while (d <= end) {
    const key = d.toFormat('yyyy-MM-dd');
    const y = d.year;
    for (const row of rows) {
      if (!holidayMatchesTenantFilters(row, { countryCode: params.countryCode || 'BR' })) continue;
      const eff = effectiveHolidayDisplayDate(row, row.is_recurring_yearly ? y : y);
      if (eff === key) {
        blockedDates.add(key);
        if (!firstBlocking) firstBlocking = { date: key, name: row.name };
        break;
      }
    }
    d = d.plus({ days: 1 });
  }

  return { blockedDates, firstBlocking };
}

export async function isLocalDateHolidayBlocked(params: {
  tenantId: string;
  countryCode: string;
  blockHolidays: boolean;
  localDay: DateTime;
}): Promise<{ blocked: false } | { blocked: true; name: string }> {
  if (!params.blockHolidays) return { blocked: false };
  const key = params.localDay.toFormat('yyyy-MM-dd');
  const y = params.localDay.year;
  const rows = await loadHolidaysApplicableForBlocking({
    tenantId: params.tenantId,
    countryCode: params.countryCode || 'BR',
  });
  for (const row of rows) {
    if (!holidayMatchesTenantFilters(row, { countryCode: params.countryCode || 'BR' })) continue;
    const eff = effectiveHolidayDisplayDate(row, row.is_recurring_yearly ? y : y);
    if (eff === key) {
      return { blocked: true, name: row.name };
    }
  }
  return { blocked: false };
}

export type ListHolidaysFilters = {
  yearFrom: number;
  yearTo: number;
  countryCode?: string;
  active?: boolean;
};

export async function listHolidaysForTenant(
  tenantId: string,
  filters: ListHolidaysFilters,
): Promise<
  Array<
    HolidayRow & {
      display_date: string;
      is_system_default: boolean;
    }
  >
> {
  const args: unknown[] = [tenantId];
  let p = 2;
  let sql = `
    SELECT h.id, h.tenant_id, h.name, h.holiday_date::text AS holiday_date, h.scope, h.country_code, h.state_code, h.city,
           h.is_recurring_yearly, h.blocks_availability, h.source, h.is_active, h.created_by, h.created_at, h.updated_at
    FROM public.appointment_holidays h
    WHERE (
        (h.scope = 'global')
        OR (h.scope = 'tenant' AND h.tenant_id = $1)
      )`;
  if (filters.active !== undefined) {
    sql += ` AND h.is_active = $${p}`;
    args.push(filters.active);
    p += 1;
  }
  if (filters.countryCode) {
    sql += ` AND (h.country_code IS NULL OR h.country_code = $${p})`;
    args.push(filters.countryCode);
    p += 1;
  }
  sql += ` ORDER BY h.holiday_date ASC, h.name ASC`;

  const r = await pool.query<HolidayRow>(sql, args);

  const out: Array<HolidayRow & { display_date: string; is_system_default: boolean }> = [];
  for (const row of r.rows) {
    const isSys = row.scope === 'global' && row.source === 'seed';
    if (row.is_recurring_yearly) {
      for (let y = filters.yearFrom; y <= filters.yearTo; y += 1) {
        const display_date = effectiveHolidayDisplayDate(row, y);
        out.push({ ...row, display_date, is_system_default: isSys });
      }
    } else {
      const display_date = effectiveHolidayDisplayDate(row, filters.yearFrom);
      const yy = parseInt(display_date.slice(0, 4), 10);
      if (yy >= filters.yearFrom && yy <= filters.yearTo) {
        out.push({ ...row, display_date, is_system_default: isSys });
      }
    }
  }
  out.sort((a, b) => a.display_date.localeCompare(b.display_date) || a.name.localeCompare(b.name));
  return out;
}

export async function getHolidayById(tenantId: string, id: string): Promise<HolidayRow | null> {
  const r = await pool.query<HolidayRow>(
    `SELECT id, tenant_id, name, holiday_date::text AS holiday_date, scope, country_code, state_code, city,
            is_recurring_yearly, blocks_availability, source, is_active, created_by, created_at, updated_at
     FROM public.appointment_holidays
     WHERE id = $1 AND (scope = 'global' OR tenant_id = $2)`,
    [id, tenantId],
  );
  return r.rows[0] ?? null;
}

export async function createTenantHoliday(params: {
  tenantId: string;
  name: string;
  holiday_date: string;
  is_recurring_yearly: boolean;
  blocks_availability: boolean;
  createdBy: string | null;
}): Promise<HolidayRow> {
  const r = await pool.query<HolidayRow>(
    `INSERT INTO public.appointment_holidays (
       tenant_id, name, holiday_date, scope, country_code, is_recurring_yearly, blocks_availability, source, created_by
     ) VALUES ($1, $2, $3::date, 'tenant', NULL, $4, $5, 'manual', $6)
     RETURNING id, tenant_id, name, holiday_date::text AS holiday_date, scope, country_code, state_code, city,
               is_recurring_yearly, blocks_availability, source, is_active, created_by, created_at, updated_at`,
    [
      params.tenantId,
      params.name.trim(),
      params.holiday_date,
      params.is_recurring_yearly,
      params.blocks_availability,
      params.createdBy,
    ],
  );
  const row = r.rows[0];
  if (!row) throw new Error('holiday_create_failed');
  return row;
}

export async function patchTenantHoliday(
  tenantId: string,
  id: string,
  patch: Partial<{
    name: string;
    holiday_date: string;
    is_recurring_yearly: boolean;
    blocks_availability: boolean;
  }>,
): Promise<HolidayRow | null> {
  const existing = await pool.query<{ scope: string; tenant_id: string | null }>(
    `SELECT scope, tenant_id FROM public.appointment_holidays WHERE id = $1`,
    [id],
  );
  const ex = existing.rows[0];
  if (!ex || ex.scope !== 'tenant' || ex.tenant_id !== tenantId) return null;

  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  let n = 1;
  const add = (col: string, v: unknown) => {
    sets.push(`${col} = $${n}`);
    vals.push(v);
    n += 1;
  };
  if (patch.name !== undefined) add('name', patch.name.trim());
  if (patch.holiday_date !== undefined) add('holiday_date', patch.holiday_date);
  if (patch.is_recurring_yearly !== undefined) add('is_recurring_yearly', patch.is_recurring_yearly);
  if (patch.blocks_availability !== undefined) add('blocks_availability', patch.blocks_availability);

  if (sets.length === 1) {
    return getHolidayById(tenantId, id);
  }

  const tid = vals.length + 1;
  const iid = vals.length + 2;
  vals.push(tenantId, id);
  const q = await pool.query<HolidayRow>(
    `UPDATE public.appointment_holidays SET ${sets.join(', ')}
     WHERE id = $${iid} AND tenant_id = $${tid} AND scope = 'tenant'
     RETURNING id, tenant_id, name, holiday_date::text AS holiday_date, scope, country_code, state_code, city,
               is_recurring_yearly, blocks_availability, source, is_active, created_by, created_at, updated_at`,
    vals,
  );
  return q.rows[0] ?? null;
}

export async function disableTenantHoliday(tenantId: string, id: string): Promise<HolidayRow | null> {
  const r = await pool.query<HolidayRow>(
    `UPDATE public.appointment_holidays
     SET is_active = false, updated_at = now()
     WHERE id = $2 AND tenant_id = $1 AND scope = 'tenant'
     RETURNING id, tenant_id, name, holiday_date::text AS holiday_date, scope, country_code, state_code, city,
               is_recurring_yearly, blocks_availability, source, is_active, created_by, created_at, updated_at`,
    [tenantId, id],
  );
  return r.rows[0] ?? null;
}
