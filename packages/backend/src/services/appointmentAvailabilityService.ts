/**
 * Disponibilidade para remarcação pública (Fase 5.1 tenant + Fase 5.2 por utilizador).
 *
 * Equipes: existe `teams` / `team_members`, mas não há modelo maduro “equipa padrão por utilizador para agenda”.
 * Fallback planejado `utilizador → equipa → tenant` fica para fase futura; nesta fase: utilizador ativo → tenant → defaults.
 */
import { DateTime } from 'luxon';
import { pool } from '../utils/db.js';

const MAX_SLOTS_RETURNED = 400;

export type AvailabilitySource = 'user' | 'tenant' | 'defaults';

export type ResolvedAvailabilitySettings = {
  timezone: string;
  slot_duration_minutes: number;
  default_meeting_duration_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  weekdays: number[];
  work_start_time: string;
  work_end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
  source: AvailabilitySource;
};

const DEFAULT_RESOLVED: ResolvedAvailabilitySettings = {
  timezone: 'America/Sao_Paulo',
  slot_duration_minutes: 30,
  default_meeting_duration_minutes: 60,
  min_notice_minutes: 120,
  max_days_ahead: 30,
  weekdays: [1, 2, 3, 4, 5],
  work_start_time: '09:00',
  work_end_time: '18:00',
  break_start_time: '12:00',
  break_end_time: '13:00',
  source: 'defaults',
};

type TenantRow = {
  tenant_id: string;
  timezone: string;
  slot_duration_minutes: number;
  default_meeting_duration_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  weekdays_json: unknown;
  work_start_time: string;
  work_end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
};

type UserRow = TenantRow & { user_id: string; is_active: boolean };

function parseWeekdays(v: unknown): number[] {
  if (!Array.isArray(v)) return [1, 2, 3, 4, 5];
  const w = v.filter((x) => typeof x === 'number' && x >= 1 && x <= 7) as number[];
  return w.length ? w : [1, 2, 3, 4, 5];
}

function timeToParts(t: string | null | undefined): { h: number; m: number } | null {
  if (t == null) return null;
  const s = String(t).trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return { h, m: min };
}

function rowToResolved(r: TenantRow, source: AvailabilitySource): ResolvedAvailabilitySettings {
  return {
    timezone: r.timezone || DEFAULT_RESOLVED.timezone,
    slot_duration_minutes: r.slot_duration_minutes,
    default_meeting_duration_minutes: r.default_meeting_duration_minutes,
    min_notice_minutes: r.min_notice_minutes,
    max_days_ahead: r.max_days_ahead,
    weekdays: parseWeekdays(r.weekdays_json),
    work_start_time: String(r.work_start_time || '09:00').slice(0, 8),
    work_end_time: String(r.work_end_time || '18:00').slice(0, 8),
    break_start_time: r.break_start_time ? String(r.break_start_time).slice(0, 8) : null,
    break_end_time: r.break_end_time ? String(r.break_end_time).slice(0, 8) : null,
    source,
  };
}

export async function ensureTenantAvailabilityRow(tenantId: string): Promise<TenantRow> {
  await pool.query(
    `INSERT INTO public.appointment_availability_settings (
       tenant_id, timezone, slot_duration_minutes, default_meeting_duration_minutes,
       min_notice_minutes, max_days_ahead, weekdays_json,
       work_start_time, work_end_time, break_start_time, break_end_time
     )
     VALUES ($1, 'America/Sao_Paulo', 30, 60, 120, 30, '[1,2,3,4,5]'::jsonb,
       '09:00', '18:00', '12:00', '13:00')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );
  const r = await pool.query<TenantRow>(
    `SELECT tenant_id, timezone, slot_duration_minutes, default_meeting_duration_minutes,
            min_notice_minutes, max_days_ahead, weekdays_json,
            work_start_time, work_end_time, break_start_time, break_end_time
     FROM public.appointment_availability_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  const row = r.rows[0];
  if (!row) throw new Error('tenant_availability_missing');
  return row;
}

export async function getTenantAvailabilitySettingsRow(tenantId: string): Promise<TenantRow> {
  return ensureTenantAvailabilityRow(tenantId);
}

export async function updateTenantAvailabilitySettings(
  tenantId: string,
  patch: Partial<{
    timezone: string;
    slot_duration_minutes: number;
    default_meeting_duration_minutes: number;
    min_notice_minutes: number;
    max_days_ahead: number;
    weekdays_json: unknown;
    work_start_time: string;
    work_end_time: string;
    break_start_time: string | null;
    break_end_time: string | null;
  }>,
): Promise<TenantRow> {
  await ensureTenantAvailabilityRow(tenantId);
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  let p = 1;
  const add = (col: string, v: unknown) => {
    sets.push(`${col} = $${p}`);
    vals.push(v);
    p += 1;
  };
  if (patch.timezone !== undefined) add('timezone', patch.timezone);
  if (patch.slot_duration_minutes !== undefined) add('slot_duration_minutes', patch.slot_duration_minutes);
  if (patch.default_meeting_duration_minutes !== undefined) {
    add('default_meeting_duration_minutes', patch.default_meeting_duration_minutes);
  }
  if (patch.min_notice_minutes !== undefined) add('min_notice_minutes', patch.min_notice_minutes);
  if (patch.max_days_ahead !== undefined) add('max_days_ahead', patch.max_days_ahead);
  if (patch.weekdays_json !== undefined) add('weekdays_json', JSON.stringify(patch.weekdays_json));
  if (patch.work_start_time !== undefined) add('work_start_time', patch.work_start_time);
  if (patch.work_end_time !== undefined) add('work_end_time', patch.work_end_time);
  if (patch.break_start_time !== undefined) add('break_start_time', patch.break_start_time);
  if (patch.break_end_time !== undefined) add('break_end_time', patch.break_end_time);
  vals.push(tenantId);
  await pool.query(
    `UPDATE public.appointment_availability_settings SET ${sets.join(', ')} WHERE tenant_id = $${p}`,
    vals,
  );
  return ensureTenantAvailabilityRow(tenantId);
}

async function fetchUserRow(tenantId: string, userId: string): Promise<UserRow | null> {
  const r = await pool.query<UserRow>(
    `SELECT tenant_id, user_id, timezone, slot_duration_minutes, default_meeting_duration_minutes,
            min_notice_minutes, max_days_ahead, weekdays_json,
            work_start_time, work_end_time, break_start_time, break_end_time, is_active
     FROM public.appointment_user_availability_settings
     WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId],
  );
  return r.rows[0] ?? null;
}

export async function resolveEffectiveAvailabilitySettings(
  tenantId: string,
  responsibleUserId: string | null,
): Promise<ResolvedAvailabilitySettings> {
  const tenant = await ensureTenantAvailabilityRow(tenantId);
  const tenantResolved = rowToResolved(tenant, 'tenant');

  if (!responsibleUserId) {
    return tenantResolved;
  }

  const ur = await fetchUserRow(tenantId, responsibleUserId);
  if (ur && ur.is_active) {
    const { is_active: _a, user_id: _u, ...rest } = ur;
    return rowToResolved(rest, 'user');
  }

  return tenantResolved;
}

export async function assertUserBelongsToTenant(userId: string, tenantId: string): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM public.users WHERE id = $1 AND tenant_id = $2`, [userId, tenantId]);
  return (r.rowCount ?? 0) > 0;
}

export type BusyInterval = { starts_at: DateTime; ends_at: DateTime };

export async function loadBusyIntervals(params: {
  tenantId: string;
  responsibleUserId: string | null;
  rangeStartUtc: DateTime;
  rangeEndUtc: DateTime;
  excludeAppointmentId?: string;
}): Promise<BusyInterval[]> {
  if (!params.responsibleUserId) return [];
  const args: unknown[] = [
    params.tenantId,
    params.responsibleUserId,
    params.rangeEndUtc.toISO(),
    params.rangeStartUtc.toISO(),
  ];
  let sql = `
    SELECT starts_at, ends_at FROM public.appointments
    WHERE tenant_id = $1 AND responsible_user_id = $2
      AND status <> 'cancelled'
      AND starts_at < $3::timestamptz AND ends_at > $4::timestamptz`;
  if (params.excludeAppointmentId) {
    args.push(params.excludeAppointmentId);
    sql += ` AND id <> $${args.length}`;
  }
  const r = await pool.query<{ starts_at: string; ends_at: string }>(sql, args);
  return r.rows.map((row) => ({
    starts_at: DateTime.fromISO(row.starts_at, { zone: 'utc' }),
    ends_at: DateTime.fromISO(row.ends_at, { zone: 'utc' }),
  }));
}

function intervalsOverlap(
  aStart: DateTime,
  aEnd: DateTime,
  bStart: DateTime,
  bEnd: DateTime,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function overlapsBreak(
  day: DateTime,
  slotStart: DateTime,
  slotEnd: DateTime,
  breakS: { h: number; m: number } | null,
  breakE: { h: number; m: number } | null,
): boolean {
  if (!breakS || !breakE) return false;
  const bs = day.set({ hour: breakS.h, minute: breakS.m, second: 0, millisecond: 0 });
  const be = day.set({ hour: breakE.h, minute: breakE.m, second: 0, millisecond: 0 });
  return intervalsOverlap(slotStart, slotEnd, bs, be);
}

export function generatePublicSlots(params: {
  settings: ResolvedAvailabilitySettings;
  busy: BusyInterval[];
  nowUtc?: DateTime;
}): { starts_at: string; ends_at: string }[] {
  const cfg = params.settings;
  const nowUtc = params.nowUtc ?? DateTime.utc();
  const zone = cfg.timezone || 'America/Sao_Paulo';
  const nowZ = nowUtc.setZone(zone);
  const meetingMin = cfg.default_meeting_duration_minutes;
  const slotStep = cfg.slot_duration_minutes;
  const ws = timeToParts(cfg.work_start_time);
  const we = timeToParts(cfg.work_end_time);
  if (!ws || !we) return [];

  const result: { starts_at: string; ends_at: string }[] = [];
  const breakS = cfg.break_start_time ? timeToParts(cfg.break_start_time) : null;
  const breakE = cfg.break_end_time ? timeToParts(cfg.break_end_time) : null;

  const weekdaySet = new Set(cfg.weekdays);
  const maxDay = cfg.max_days_ahead;

  for (let d = 0; d <= maxDay && result.length < MAX_SLOTS_RETURNED; d++) {
    const day = nowZ.startOf('day').plus({ days: d });
    if (!weekdaySet.has(day.weekday)) continue;

    let workStart = day.set({ hour: ws.h, minute: ws.m, second: 0, millisecond: 0 });
    const workEnd = day.set({ hour: we.h, minute: we.m, second: 0, millisecond: 0 });
    if (workEnd <= workStart) continue;

    let t = workStart;
    while (t.plus({ minutes: meetingMin }) <= workEnd && result.length < MAX_SLOTS_RETURNED) {
      const slotEnd = t.plus({ minutes: meetingMin });
      if (slotEnd > workEnd) break;

      if (breakS && breakE && overlapsBreak(day, t, slotEnd, breakS, breakE)) {
        t = t.plus({ minutes: slotStep });
        continue;
      }

      const minStart = nowZ.plus({ minutes: cfg.min_notice_minutes });
      if (t < minStart) {
        t = t.plus({ minutes: slotStep });
        continue;
      }

      const tUtc = t.toUTC();
      const endUtc = slotEnd.toUTC();
      let hit = false;
      for (const b of params.busy) {
        if (intervalsOverlap(tUtc, endUtc, b.starts_at, b.ends_at)) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        result.push({ starts_at: tUtc.toISO()!, ends_at: endUtc.toISO()! });
      }
      t = t.plus({ minutes: slotStep });
    }
  }

  return result;
}

/** Valida horário de remarcação contra regra resolvida + ocupação (exceto compromisso atual). */
export async function validatePublicRescheduleAgainstAvailability(params: {
  tenantId: string;
  responsibleUserId: string | null;
  excludeAppointmentId: string;
  startsAtIso: string;
  endsAtIso: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const settings = await resolveEffectiveAvailabilitySettings(params.tenantId, params.responsibleUserId);
  const startUtc = DateTime.fromISO(params.startsAtIso, { zone: 'utc' });
  const endUtc = DateTime.fromISO(params.endsAtIso, { zone: 'utc' });
  if (!startUtc.isValid || !endUtc.isValid) {
    return { ok: false, message: 'Data ou horário inválidos.' };
  }
  const durMin = endUtc.diff(startUtc, 'minutes').minutes;
  if (Math.abs(durMin - settings.default_meeting_duration_minutes) > 0.5) {
    return {
      ok: false,
      message: `A duração deve ser de ${settings.default_meeting_duration_minutes} minutos conforme disponibilidade configurada.`,
    };
  }

  const zone = settings.timezone;
  const startZ = startUtc.setZone(zone);
  const nowZ = DateTime.utc().setZone(zone);
  const minStart = nowZ.plus({ minutes: settings.min_notice_minutes });
  if (startZ < minStart) {
    return { ok: false, message: 'Este horário não respeita a antecedência mínima configurada.' };
  }

  const lastDay = nowZ.startOf('day').plus({ days: settings.max_days_ahead }).endOf('day');
  if (startZ > lastDay) {
    return { ok: false, message: 'Data fora do limite de dias permitido para agendamento.' };
  }

  if (!settings.weekdays.includes(startZ.weekday)) {
    return { ok: false, message: 'Este dia da semana não está disponível para agendamento.' };
  }

  const ws = timeToParts(settings.work_start_time);
  const we = timeToParts(settings.work_end_time);
  if (!ws || !we) return { ok: false, message: 'Configuração de horário inválida.' };

  const dayStart = startZ.startOf('day');
  const workStart = dayStart.set({ hour: ws.h, minute: ws.m });
  const workEnd = dayStart.set({ hour: we.h, minute: we.m });
  const slotEndZ = startZ.plus({ minutes: settings.default_meeting_duration_minutes });
  if (startZ < workStart || slotEndZ > workEnd) {
    return { ok: false, message: 'Horário fora do expediente configurado.' };
  }

  if (settings.break_start_time && settings.break_end_time) {
    const bs = timeToParts(settings.break_start_time);
    const be = timeToParts(settings.break_end_time);
    if (bs && be) {
      const bStart = dayStart.set({ hour: bs.h, minute: bs.m });
      const bEnd = dayStart.set({ hour: be.h, minute: be.m });
      if (intervalsOverlap(startZ, slotEndZ, bStart, bEnd)) {
        return { ok: false, message: 'Horário coincide com o intervalo de pausa configurado.' };
      }
    }
  }

  const wsMin = workStart.hour * 60 + workStart.minute;
  const off = startZ.hour * 60 + startZ.minute - wsMin;
  if (off < 0 || off % settings.slot_duration_minutes !== 0) {
    return { ok: false, message: 'O horário de início deve alinhar aos slots configurados.' };
  }

  const rangeStart = startUtc.minus({ hours: 1 });
  const rangeEnd = endUtc.plus({ hours: 1 });
  const busy = await loadBusyIntervals({
    tenantId: params.tenantId,
    responsibleUserId: params.responsibleUserId,
    rangeStartUtc: rangeStart,
    rangeEndUtc: rangeEnd,
    excludeAppointmentId: params.excludeAppointmentId,
  });
  for (const b of busy) {
    if (intervalsOverlap(startUtc, endUtc, b.starts_at, b.ends_at)) {
      return { ok: false, message: 'Este horário já está ocupado na agenda do responsável.' };
    }
  }

  return { ok: true };
}

type PublicApptRow = {
  id: string;
  tenant_id: string;
  responsible_user_id: string | null;
  status: string;
  public_confirmation_token_expires_at: string | null;
  public_confirmation_responded_at: string | null;
  public_confirmation_response: string | null;
};

async function loadAppointmentByPublicToken(token: string): Promise<PublicApptRow | null> {
  const r = await pool.query<PublicApptRow>(
    `SELECT id, tenant_id, responsible_user_id, status,
            public_confirmation_token_expires_at, public_confirmation_responded_at, public_confirmation_response
     FROM public.appointments
     WHERE public_confirmation_token = $1 LIMIT 1`,
    [token],
  );
  return r.rows[0] ?? null;
}

export async function getPublicAvailabilitySlotsForToken(token: string): Promise<
  | {
      ok: true;
      timezone: string;
      slot_duration_minutes: number;
      default_meeting_duration_minutes: number;
      settings_source: AvailabilitySource;
      slots: { starts_at: string; ends_at: string }[];
    }
  | { ok: false; code: string; message?: string }
> {
  const row = await loadAppointmentByPublicToken(token);
  if (!row) return { ok: false, code: 'not_found' };
  if (row.public_confirmation_responded_at || row.public_confirmation_response) {
    return { ok: false, code: 'already_responded' };
  }
  const exp = row.public_confirmation_token_expires_at
    ? new Date(row.public_confirmation_token_expires_at).getTime()
    : 0;
  if (exp <= Date.now()) return { ok: false, code: 'expired' };
  if (row.status !== 'scheduled') return { ok: false, code: 'invalid_state', message: 'Compromisso não está agendado.' };

  const settings = await resolveEffectiveAvailabilitySettings(row.tenant_id, row.responsible_user_id);
  const nowUtc = DateTime.utc();
  const rangeEnd = nowUtc.plus({ days: settings.max_days_ahead + 1 });
  const busy = await loadBusyIntervals({
    tenantId: row.tenant_id,
    responsibleUserId: row.responsible_user_id,
    rangeStartUtc: nowUtc,
    rangeEndUtc: rangeEnd,
    excludeAppointmentId: row.id,
  });

  const slots = generatePublicSlots({ settings, busy, nowUtc });

  return {
    ok: true,
    timezone: settings.timezone,
    slot_duration_minutes: settings.slot_duration_minutes,
    default_meeting_duration_minutes: settings.default_meeting_duration_minutes,
    settings_source: settings.source,
    slots,
  };
}

export async function getUserAvailabilitySettingsForApi(params: {
  tenantId: string;
  targetUserId: string;
}): Promise<{ row: UserRow | null; effective: ResolvedAvailabilitySettings }> {
  const row = await fetchUserRow(params.tenantId, params.targetUserId);
  const effective = await resolveEffectiveAvailabilitySettings(params.tenantId, params.targetUserId);
  return { row, effective };
}

export async function upsertUserAvailabilitySettings(params: {
  tenantId: string;
  userId: string;
  patch: {
    timezone?: string;
    slot_duration_minutes?: number;
    default_meeting_duration_minutes?: number;
    min_notice_minutes?: number;
    max_days_ahead?: number;
    weekdays?: number[];
    work_start_time?: string;
    work_end_time?: string;
    break_start_time?: string | null;
    break_end_time?: string | null;
    is_active?: boolean;
  };
}): Promise<UserRow> {
  const p = params.patch;
  const existing = await fetchUserRow(params.tenantId, params.userId);
  const tenantDefaults = await ensureTenantAvailabilityRow(params.tenantId);

  if (!existing) {
    await pool.query(
      `INSERT INTO public.appointment_user_availability_settings (
         tenant_id, user_id, timezone, slot_duration_minutes, default_meeting_duration_minutes,
         min_notice_minutes, max_days_ahead, weekdays_json,
         work_start_time, work_end_time, break_start_time, break_end_time, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)`,
      [
        params.tenantId,
        params.userId,
        p.timezone ?? tenantDefaults.timezone,
        p.slot_duration_minutes ?? tenantDefaults.slot_duration_minutes,
        p.default_meeting_duration_minutes ?? tenantDefaults.default_meeting_duration_minutes,
        p.min_notice_minutes ?? tenantDefaults.min_notice_minutes,
        p.max_days_ahead ?? tenantDefaults.max_days_ahead,
        JSON.stringify(p.weekdays ?? parseWeekdays(tenantDefaults.weekdays_json)),
        p.work_start_time ?? tenantDefaults.work_start_time,
        p.work_end_time ?? tenantDefaults.work_end_time,
        p.break_start_time !== undefined ? p.break_start_time : tenantDefaults.break_start_time,
        p.break_end_time !== undefined ? p.break_end_time : tenantDefaults.break_end_time,
        p.is_active ?? true,
      ],
    );
  } else {
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [];
    let n = 1;
    const add = (col: string, v: unknown) => {
      sets.push(`${col} = $${n}`);
      vals.push(v);
      n += 1;
    };
    if (p.timezone !== undefined) add('timezone', p.timezone);
    if (p.slot_duration_minutes !== undefined) add('slot_duration_minutes', p.slot_duration_minutes);
    if (p.default_meeting_duration_minutes !== undefined) {
      add('default_meeting_duration_minutes', p.default_meeting_duration_minutes);
    }
    if (p.min_notice_minutes !== undefined) add('min_notice_minutes', p.min_notice_minutes);
    if (p.max_days_ahead !== undefined) add('max_days_ahead', p.max_days_ahead);
    if (p.weekdays !== undefined) add('weekdays_json', JSON.stringify(p.weekdays));
    if (p.work_start_time !== undefined) add('work_start_time', p.work_start_time);
    if (p.work_end_time !== undefined) add('work_end_time', p.work_end_time);
    if (p.break_start_time !== undefined) add('break_start_time', p.break_start_time);
    if (p.break_end_time !== undefined) add('break_end_time', p.break_end_time);
    if (p.is_active !== undefined) add('is_active', p.is_active);
    const tp = vals.length + 1;
    const up = vals.length + 2;
    vals.push(params.tenantId, params.userId);
    await pool.query(
      `UPDATE public.appointment_user_availability_settings SET ${sets.join(', ')}
       WHERE tenant_id = $${tp} AND user_id = $${up}`,
      vals,
    );
  }

  const row = await fetchUserRow(params.tenantId, params.userId);
  if (!row) throw new Error('user_availability_upsert_failed');
  return row;
}
