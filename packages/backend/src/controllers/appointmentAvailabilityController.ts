import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { getEffectiveModulePermissions, ModulePermissionError } from '../services/modulePermissionsService.js';
import { hasSettingsView, hasSettingsEdit } from '../services/agendaAccessControl.js';
import {
  assertUserBelongsToTenant,
  ensureTenantAvailabilityRow,
  getTenantAvailabilitySettingsRow,
  updateTenantAvailabilitySettings,
  getUserAvailabilitySettingsForApi,
  upsertUserAvailabilitySettings,
  resolveEffectiveAvailabilitySettings,
  type ResolvedAvailabilitySettings,
} from '../services/appointmentAvailabilityService.js';

const MODULE = 'agenda' as const;

function tenantRowToApi(row: Awaited<ReturnType<typeof getTenantAvailabilitySettingsRow>>) {
  const cap =
    typeof row.capacity_per_slot === 'number' && Number.isFinite(row.capacity_per_slot)
      ? Math.min(20, Math.max(1, Math.floor(row.capacity_per_slot)))
      : 1;
  return {
    timezone: row.timezone,
    slot_duration_minutes: row.slot_duration_minutes,
    default_meeting_duration_minutes: row.default_meeting_duration_minutes,
    min_notice_minutes: row.min_notice_minutes,
    max_days_ahead: row.max_days_ahead,
    weekdays: JSON.parse(JSON.stringify(row.weekdays_json)),
    work_start_time: String(row.work_start_time).slice(0, 5),
    work_end_time: String(row.work_end_time).slice(0, 5),
    break_start_time: row.break_start_time ? String(row.break_start_time).slice(0, 5) : null,
    break_end_time: row.break_end_time ? String(row.break_end_time).slice(0, 5) : null,
    capacity_per_slot: cap,
    block_holidays: row.block_holidays !== false,
    holiday_country_code: row.holiday_country_code || 'BR',
    holiday_state_code: row.holiday_state_code,
    holiday_city: row.holiday_city,
  };
}

function userRowToApi(row: NonNullable<Awaited<ReturnType<typeof getUserAvailabilitySettingsForApi>>['row']>) {
  const cap =
    typeof row.capacity_per_slot === 'number' && Number.isFinite(row.capacity_per_slot)
      ? Math.min(20, Math.max(1, Math.floor(row.capacity_per_slot)))
      : 1;
  return {
    timezone: row.timezone,
    slot_duration_minutes: row.slot_duration_minutes,
    default_meeting_duration_minutes: row.default_meeting_duration_minutes,
    min_notice_minutes: row.min_notice_minutes,
    max_days_ahead: row.max_days_ahead,
    weekdays: JSON.parse(JSON.stringify(row.weekdays_json)),
    work_start_time: String(row.work_start_time).slice(0, 5),
    work_end_time: String(row.work_end_time).slice(0, 5),
    break_start_time: row.break_start_time ? String(row.break_start_time).slice(0, 5) : null,
    break_end_time: row.break_end_time ? String(row.break_end_time).slice(0, 5) : null,
    capacity_per_slot: cap,
    is_active: row.is_active,
  };
}

function resolvedToApi(r: ResolvedAvailabilitySettings) {
  return {
    timezone: r.timezone,
    slot_duration_minutes: r.slot_duration_minutes,
    default_meeting_duration_minutes: r.default_meeting_duration_minutes,
    min_notice_minutes: r.min_notice_minutes,
    max_days_ahead: r.max_days_ahead,
    weekdays: r.weekdays,
    work_start_time: r.work_start_time.slice(0, 5),
    work_end_time: r.work_end_time.slice(0, 5),
    break_start_time: r.break_start_time,
    break_end_time: r.break_end_time,
    capacity_per_slot: r.capacity_per_slot,
    source: r.source,
  };
}

async function assertAgendaView(req: AuthRequest): Promise<void> {
  const perms = await getEffectiveModulePermissions(req.userId!);
  const p = perms[MODULE];
  if (p?.can_view === false) {
    throw new ModulePermissionError(403, 'Sem permissão para a Agenda');
  }
}

const tenantPatchSchema = z.object({
  timezone: z.string().min(3).max(80).optional(),
  slot_duration_minutes: z.number().int().min(10).max(180).optional(),
  default_meeting_duration_minutes: z.number().int().min(15).max(480).optional(),
  min_notice_minutes: z.number().int().min(0).max(10080).optional(),
  max_days_ahead: z.number().int().min(1).max(365).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  work_start_time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  work_end_time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  break_start_time: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
  break_end_time: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
  block_holidays: z.boolean().optional(),
  holiday_country_code: z.string().min(2).max(8).optional(),
  holiday_state_code: z.string().max(8).nullable().optional(),
  holiday_city: z.string().max(120).nullable().optional(),
  capacity_per_slot: z.number().int().min(1).max(20).optional(),
});

const userPatchSchema = tenantPatchSchema.extend({
  user_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
});

/** GET /api/appointments/tenant-availability-settings */
export async function getTenantAvailabilitySettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  try {
    await assertAgendaView(req);
    if (!(await hasSettingsView(req.userId!, req))) {
      res.status(403).json({ error: 'Sem permissão para ver a disponibilidade da empresa.' });
      return;
    }
    const row = await getTenantAvailabilitySettingsRow(tenantId);
    res.json({ settings: tenantRowToApi(row) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] tenant availability get', e);
    res.status(500).json({ error: 'Erro ao carregar disponibilidade da empresa' });
  }
}

/** PATCH /api/appointments/tenant-availability-settings */
export async function patchTenantAvailabilitySettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = tenantPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    await assertAgendaView(req);
    if (!(await hasSettingsEdit(req.userId!, req))) {
      res.status(403).json({
        error:
          'Apenas administrador, gestor ou permissão de edição em Configurações pode alterar a disponibilidade geral.',
      });
      return;
    }
    const { weekdays, ...rest } = parsed.data;
    const row = await updateTenantAvailabilitySettings(tenantId, {
      ...rest,
      ...(weekdays !== undefined ? { weekdays_json: weekdays } : {}),
    });
    res.json({ settings: tenantRowToApi(row) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] tenant availability patch', e);
    res.status(500).json({ error: 'Erro ao guardar disponibilidade da empresa' });
  }
}

/** GET /api/appointments/user-availability-settings?user_id= */
export async function getUserAvailabilitySettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const qUser = typeof req.query.user_id === 'string' ? req.query.user_id.trim() : '';
  const targetUserId = qUser || req.userId;
  try {
    await assertAgendaView(req);
    if (targetUserId !== req.userId) {
      if (!(await hasSettingsEdit(req.userId!, req))) {
        res.status(403).json({ error: 'Sem permissão para ver a disponibilidade deste utilizador.' });
        return;
      }
    }
    const inTenant = await assertUserBelongsToTenant(targetUserId, tenantId);
    if (!inTenant) {
      res.status(404).json({ error: 'Utilizador não encontrado nesta conta.' });
      return;
    }
    const { row, effective } = await getUserAvailabilitySettingsForApi({ tenantId, targetUserId });
    const tenant = await ensureTenantAvailabilityRow(tenantId);
    res.json({
      target_user_id: targetUserId,
      user_settings: row ? userRowToApi(row) : null,
      company_defaults: tenantRowToApi(tenant),
      effective: resolvedToApi(effective),
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] user availability get', e);
    res.status(500).json({ error: 'Erro ao carregar disponibilidade do utilizador' });
  }
}

/** PATCH /api/appointments/user-availability-settings */
export async function patchUserAvailabilitySettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = userPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  const targetUserId = parsed.data.user_id ?? req.userId!;
  try {
    await assertAgendaView(req);
    if (targetUserId !== req.userId) {
      if (!(await hasSettingsEdit(req.userId!, req))) {
        res.status(403).json({ error: 'Sem permissão para editar a disponibilidade deste utilizador.' });
        return;
      }
    }
    const inTenant = await assertUserBelongsToTenant(targetUserId, tenantId);
    if (!inTenant) {
      res.status(404).json({ error: 'Utilizador não encontrado nesta conta.' });
      return;
    }
    const { user_id: _uid, ...patch } = parsed.data;
    const row = await upsertUserAvailabilitySettings({
      tenantId,
      userId: targetUserId,
      patch,
    });
    const effective = await resolveEffectiveAvailabilitySettings(tenantId, targetUserId);
    res.json({
      target_user_id: targetUserId,
      user_settings: userRowToApi(row),
      effective: resolvedToApi(effective),
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] user availability patch', e);
    res.status(500).json({ error: 'Erro ao guardar disponibilidade do utilizador' });
  }
}
