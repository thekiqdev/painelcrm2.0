import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { getEffectiveModulePermissions, ModulePermissionError } from '../services/modulePermissionsService.js';
import { hasSettingsEdit } from '../services/agendaAccessControl.js';
import {
  listHolidaysForTenant,
  createTenantHoliday,
  patchTenantHoliday,
  disableTenantHoliday,
  getHolidayById,
  effectiveHolidayDisplayDate,
  type HolidayRow,
} from '../services/appointmentHolidaysService.js';

const MODULE = 'agenda' as const;

async function assertAgendaView(req: AuthRequest): Promise<void> {
  const perms = await getEffectiveModulePermissions(req.userId!);
  const p = perms[MODULE];
  if (p?.can_view === false) {
    throw new ModulePermissionError(403, 'Sem permissão para a Agenda');
  }
}

function rowToJson(
  row: HolidayRow & { display_date?: string; is_system_default?: boolean },
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    holiday_date: row.holiday_date.slice(0, 10),
    scope: row.scope,
    country_code: row.country_code,
    state_code: row.state_code,
    city: row.city,
    is_recurring_yearly: row.is_recurring_yearly,
    blocks_availability: row.blocks_availability,
    source: row.source,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.display_date !== undefined) base.display_date = row.display_date;
  if (row.is_system_default !== undefined) base.is_system_default = row.is_system_default;
  return base;
}

const listQuerySchema = z.object({
  year_from: z.coerce.number().int().min(2000).max(2100).optional(),
  year_to: z.coerce.number().int().min(2000).max(2100).optional(),
  country_code: z.string().min(2).max(8).optional(),
  active: z.enum(['true', 'false']).optional(),
});

const createBodySchema = z.object({
  name: z.string().min(1).max(500),
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_recurring_yearly: z.boolean().optional(),
  blocks_availability: z.boolean().optional(),
});

const patchBodySchema = z.object({
  name: z.string().min(1).max(500).optional(),
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_recurring_yearly: z.boolean().optional(),
  blocks_availability: z.boolean().optional(),
});

/** GET /api/appointments/holidays */
export async function listAppointmentHolidaysHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = listQuerySchema.safeParse({
    year_from: req.query.year_from ?? req.query.year,
    year_to: req.query.year_to ?? req.query.year,
    country_code: req.query.country_code,
    active: req.query.active,
  });
  if (!parsed.success) {
    res.status(400).json({ error: 'Filtros inválidos', details: parsed.error.flatten() });
    return;
  }
  const y = new Date().getFullYear();
  const yearFrom = parsed.data.year_from ?? y;
  const yearTo = parsed.data.year_to ?? yearFrom;
  const active =
    parsed.data.active === undefined ? undefined : parsed.data.active === 'true' ? true : false;
  try {
    await assertAgendaView(req);
    const rows = await listHolidaysForTenant(tenantId, {
      yearFrom,
      yearTo,
      countryCode: parsed.data.country_code,
      active,
    });
    res.json({
      holidays: rows.map((r) =>
        rowToJson({
          ...r,
          display_date: r.display_date,
          is_system_default: r.is_system_default,
        }),
      ),
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] holidays list', e);
    res.status(500).json({ error: 'Erro ao listar feriados' });
  }
}

/** POST /api/appointments/holidays */
export async function createAppointmentHolidayHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = createBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    await assertAgendaView(req);
    const ok = await hasSettingsEdit(req.userId, req);
    if (!ok) {
      res.status(403).json({ error: 'Sem permissão para criar feriados.' });
      return;
    }
    const row = await createTenantHoliday({
      tenantId,
      name: parsed.data.name,
      holiday_date: parsed.data.holiday_date,
      is_recurring_yearly: parsed.data.is_recurring_yearly ?? false,
      blocks_availability: parsed.data.blocks_availability ?? true,
      createdBy: req.userId,
    });
    const display_date = effectiveHolidayDisplayDate(
      row,
      parseInt(parsed.data.holiday_date.slice(0, 4), 10),
    );
    res.status(201).json({
      holiday: rowToJson({ ...row, display_date, is_system_default: false }),
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] holidays create', e);
    res.status(500).json({ error: 'Erro ao criar feriado' });
  }
}

/** PATCH /api/appointments/holidays/:id */
export async function patchAppointmentHolidayHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = patchBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    await assertAgendaView(req);
    const existing = await getHolidayById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Feriado não encontrado' });
      return;
    }
    if (existing.scope === 'global') {
      res.status(403).json({ error: 'Feriados do sistema não podem ser editados.' });
      return;
    }
    const ok = await hasSettingsEdit(req.userId, req);
    if (!ok) {
      res.status(403).json({ error: 'Sem permissão para editar feriados.' });
      return;
    }
    const updated = await patchTenantHoliday(tenantId, id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Feriado não encontrado' });
      return;
    }
    const y = parseInt(updated.holiday_date.slice(0, 4), 10);
    const display_date = effectiveHolidayDisplayDate(updated, updated.is_recurring_yearly ? y : y);
    res.json({
      holiday: rowToJson({ ...updated, display_date, is_system_default: false }),
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] holidays patch', e);
    res.status(500).json({ error: 'Erro ao atualizar feriado' });
  }
}

/** POST /api/appointments/holidays/:id/disable */
export async function disableAppointmentHolidayHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    await assertAgendaView(req);
    const existing = await getHolidayById(tenantId, id);
    if (!existing) {
      res.status(404).json({ error: 'Feriado não encontrado' });
      return;
    }
    if (existing.scope === 'global') {
      res.status(403).json({ error: 'Feriados do sistema não podem ser desativados pelo tenant.' });
      return;
    }
    const ok = await hasSettingsEdit(req.userId, req);
    if (!ok) {
      res.status(403).json({ error: 'Sem permissão.' });
      return;
    }
    const row = await disableTenantHoliday(tenantId, id);
    if (!row) {
      res.status(404).json({ error: 'Feriado não encontrado' });
      return;
    }
    const y = parseInt(row.holiday_date.slice(0, 4), 10);
    const display_date = effectiveHolidayDisplayDate(row, row.is_recurring_yearly ? y : y);
    res.json({
      holiday: rowToJson({ ...row, display_date, is_system_default: false }),
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] holidays disable', e);
    res.status(500).json({ error: 'Erro ao desativar feriado' });
  }
}
