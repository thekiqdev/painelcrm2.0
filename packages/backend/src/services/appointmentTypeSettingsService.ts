import { DateTime } from 'luxon';
import { pool } from '../utils/db.js';

export type AppointmentTypeSettingRow = {
  id: string;
  tenant_id: string;
  type_key: string;
  label: string;
  description: string | null;
  default_duration_minutes: number;
  color: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Seeds alinhados ao spec + `visit` legado. */
const TENANT_DEFAULT_ROWS: {
  type_key: string;
  label: string;
  default_duration_minutes: number;
  sort_order: number;
}[] = [
  { type_key: 'meeting', label: 'Reunião', default_duration_minutes: 60, sort_order: 10 },
  { type_key: 'call', label: 'Ligação', default_duration_minutes: 30, sort_order: 20 },
  { type_key: 'demo', label: 'Demonstração', default_duration_minutes: 45, sort_order: 30 },
  { type_key: 'onboarding', label: 'Onboarding', default_duration_minutes: 60, sort_order: 40 },
  { type_key: 'support', label: 'Suporte', default_duration_minutes: 30, sort_order: 50 },
  { type_key: 'billing', label: 'Cobrança', default_duration_minutes: 30, sort_order: 60 },
  { type_key: 'follow_up', label: 'Follow-up', default_duration_minutes: 30, sort_order: 70 },
  { type_key: 'other', label: 'Outro', default_duration_minutes: 60, sort_order: 80 },
  { type_key: 'visit', label: 'Visita', default_duration_minutes: 60, sort_order: 85 },
];

function clampDur(n: number): number {
  if (!Number.isFinite(n)) return 60;
  return Math.min(480, Math.max(5, Math.round(n)));
}

/** Quando o tenant ainda não tem linhas, insere defaults idempotente. */
export async function ensureAppointmentTypeDefaults(tenantId: string): Promise<void> {
  const c = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM public.appointment_type_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  const n = parseInt(c.rows[0]?.n ?? '0', 10);
  if (n > 0) return;

  for (const row of TENANT_DEFAULT_ROWS) {
    await pool.query(
      `INSERT INTO public.appointment_type_settings (
         tenant_id, type_key, label, description, default_duration_minutes, color, is_active, sort_order
       ) VALUES ($1, $2, $3, NULL, $4, NULL, true, $5)
       ON CONFLICT (tenant_id, type_key) DO NOTHING`,
      [tenantId, row.type_key, row.label, row.default_duration_minutes, row.sort_order],
    );
  }
}

export async function listAppointmentTypeSettings(tenantId: string): Promise<AppointmentTypeSettingRow[]> {
  await ensureAppointmentTypeDefaults(tenantId);
  const r = await pool.query<AppointmentTypeSettingRow>(
    `SELECT id, tenant_id, type_key, label, description, default_duration_minutes, color, is_active, sort_order,
            created_by, created_at, updated_at
     FROM public.appointment_type_settings
     WHERE tenant_id = $1
     ORDER BY sort_order ASC, label ASC`,
    [tenantId],
  );
  return r.rows;
}

export async function createAppointmentTypeSetting(params: {
  tenantId: string;
  userId: string | null;
  type_key: string;
  label: string;
  description?: string | null;
  default_duration_minutes: number;
  color?: string | null;
  sort_order?: number;
}): Promise<AppointmentTypeSettingRow> {
  await ensureAppointmentTypeDefaults(params.tenantId);
  const r = await pool.query<AppointmentTypeSettingRow>(
    `INSERT INTO public.appointment_type_settings (
       tenant_id, type_key, label, description, default_duration_minutes, color, is_active, sort_order, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
     RETURNING id, tenant_id, type_key, label, description, default_duration_minutes, color, is_active, sort_order,
               created_by, created_at, updated_at`,
    [
      params.tenantId,
      params.type_key,
      params.label,
      params.description ?? null,
      clampDur(params.default_duration_minutes),
      params.color ?? null,
      params.sort_order ?? 0,
      params.userId,
    ],
  );
  const row = r.rows[0];
  if (!row) throw new Error('appointment_type_create_failed');
  return row;
}

export async function patchAppointmentTypeSetting(
  tenantId: string,
  id: string,
  patch: Partial<{
    label: string;
    description: string | null;
    default_duration_minutes: number;
    color: string | null;
    is_active: boolean;
    sort_order: number;
  }>,
): Promise<AppointmentTypeSettingRow | null> {
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  let p = 1;
  const add = (col: string, v: unknown) => {
    sets.push(`${col} = $${p}`);
    vals.push(v);
    p += 1;
  };
  if (patch.label !== undefined) add('label', patch.label);
  if (patch.description !== undefined) add('description', patch.description);
  if (patch.default_duration_minutes !== undefined) add('default_duration_minutes', clampDur(patch.default_duration_minutes));
  if (patch.color !== undefined) add('color', patch.color);
  if (patch.is_active !== undefined) add('is_active', patch.is_active);
  if (patch.sort_order !== undefined) add('sort_order', patch.sort_order);
  if (sets.length === 1) {
    const cur = await pool.query<AppointmentTypeSettingRow>(
      `SELECT id, tenant_id, type_key, label, description, default_duration_minutes, color, is_active, sort_order,
              created_by, created_at, updated_at
       FROM public.appointment_type_settings WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return cur.rows[0] ?? null;
  }
  vals.push(tenantId, id);
  const r = await pool.query<AppointmentTypeSettingRow>(
    `UPDATE public.appointment_type_settings SET ${sets.join(', ')}
     WHERE tenant_id = $${p} AND id = $${p + 1}
     RETURNING id, tenant_id, type_key, label, description, default_duration_minutes, color, is_active, sort_order,
               created_by, created_at, updated_at`,
    vals,
  );
  return r.rows[0] ?? null;
}

export async function disableAppointmentTypeSetting(tenantId: string, id: string): Promise<AppointmentTypeSettingRow | null> {
  return patchAppointmentTypeSetting(tenantId, id, { is_active: false });
}

async function getActiveTypeDurationMinutes(tenantId: string, typeKey: string | null): Promise<number | null> {
  if (!typeKey?.trim()) return null;
  await ensureAppointmentTypeDefaults(tenantId);
  const r = await pool.query<{ default_duration_minutes: number }>(
    `SELECT default_duration_minutes FROM public.appointment_type_settings
     WHERE tenant_id = $1 AND type_key = $2 AND is_active = true`,
    [tenantId, typeKey],
  );
  const row = r.rows[0];
  return row ? clampDur(row.default_duration_minutes) : null;
}

/** Duração padrão do tipo na agenda do tenant (fallback 60 min). */
export async function getDefaultDurationMinutesForAppointmentType(
  tenantId: string,
  typeKey: string,
): Promise<number> {
  const v = await getActiveTypeDurationMinutes(tenantId, typeKey);
  return v != null ? v : 60;
}

/**
 * Remarcação pública: duração atual do compromisso → tipo ativo → disponibilidade.
 */
export async function resolvePublicRescheduleMeetingMinutes(params: {
  tenantId: string;
  appointmentType: string | null;
  appointmentStartsAtIso: string;
  appointmentEndsAtIso: string;
  availabilityFallbackMinutes: number;
}): Promise<number> {
  const startUtc = DateTime.fromISO(params.appointmentStartsAtIso, { zone: 'utc' });
  const endUtc = DateTime.fromISO(params.appointmentEndsAtIso, { zone: 'utc' });
  if (startUtc.isValid && endUtc.isValid && endUtc > startUtc) {
    const actual = Math.round(endUtc.diff(startUtc, 'minutes').minutes);
    if (actual >= 5 && actual <= 480) return actual;
  }
  const fromType = await getActiveTypeDurationMinutes(params.tenantId, params.appointmentType);
  if (fromType != null) return fromType;
  return clampDur(params.availabilityFallbackMinutes);
}

export async function loadTypeLabelsForTenant(tenantId: string): Promise<Record<string, string>> {
  await ensureAppointmentTypeDefaults(tenantId);
  const r = await pool.query<{ type_key: string; label: string }>(
    `SELECT type_key, label FROM public.appointment_type_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  return Object.fromEntries(r.rows.map((x) => [x.type_key, x.label]));
}
