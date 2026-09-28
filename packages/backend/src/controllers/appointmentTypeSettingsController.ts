import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { getEffectiveModulePermissions, ModulePermissionError } from '../services/modulePermissionsService.js';
import { hasSettingsEdit, hasSettingsView } from '../services/agendaAccessControl.js';
import {
  createAppointmentTypeSetting,
  disableAppointmentTypeSetting,
  listAppointmentTypeSettings,
  patchAppointmentTypeSetting,
  type AppointmentTypeSettingRow,
} from '../services/appointmentTypeSettingsService.js';

const MODULE = 'agenda' as const;

const typeKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, 'Chave inválida (use minúsculas, números e _).');

const createBodySchema = z.object({
  type_key: typeKeySchema,
  label: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  default_duration_minutes: z.number().int().min(5).max(480),
  color: z.string().max(40).nullable().optional(),
  sort_order: z.number().int().min(0).max(99999).optional(),
});

const patchBodySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  default_duration_minutes: z.number().int().min(5).max(480).optional(),
  color: z.string().max(40).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(99999).optional(),
});

function rowToApi(row: AppointmentTypeSettingRow) {
  return {
    id: row.id,
    type_key: row.type_key,
    label: row.label,
    description: row.description,
    default_duration_minutes: row.default_duration_minutes,
    color: row.color,
    is_active: row.is_active,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function assertAgendaView(req: AuthRequest): Promise<void> {
  const perms = await getEffectiveModulePermissions(req.userId!);
  const p = perms[MODULE];
  if (p?.can_view === false) {
    throw new ModulePermissionError(403, 'Sem permissão para a Agenda');
  }
}

/** GET /api/appointments/type-settings */
export async function listAppointmentTypeSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  try {
    await assertAgendaView(req);
    const rows = await listAppointmentTypeSettings(tenantId);
    res.json({ items: rows.map(rowToApi) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] type-settings list', e);
    res.status(500).json({ error: 'Erro ao listar tipos de compromisso' });
  }
}

/** POST /api/appointments/type-settings */
export async function postAppointmentTypeSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = createBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    await assertAgendaView(req);
    if (!(await hasSettingsEdit(req.userId!, req))) {
      res.status(403).json({
        error: 'Apenas administrador, gestor ou permissão de edição em Configurações pode gerir tipos de compromisso.',
      });
      return;
    }
    const row = await createAppointmentTypeSetting({
      tenantId,
      userId: req.userId,
      ...parsed.data,
    });
    res.status(201).json({ item: rowToApi(row) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      res.status(409).json({ error: 'Já existe um tipo com esta chave.' });
      return;
    }
    console.error('[appointments] type-settings create', e);
    res.status(500).json({ error: 'Erro ao criar tipo de compromisso' });
  }
}

/** PATCH /api/appointments/type-settings/:id */
export async function patchAppointmentTypeSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
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
    if (!(await hasSettingsEdit(req.userId!, req))) {
      res.status(403).json({
        error: 'Apenas administrador, gestor ou permissão de edição em Configurações pode gerir tipos de compromisso.',
      });
      return;
    }
    const row = await patchAppointmentTypeSetting(tenantId, id, parsed.data);
    if (!row) {
      res.status(404).json({ error: 'Tipo não encontrado' });
      return;
    }
    res.json({ item: rowToApi(row) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] type-settings patch', e);
    res.status(500).json({ error: 'Erro ao atualizar tipo de compromisso' });
  }
}

/** POST /api/appointments/type-settings/:id/disable */
export async function postAppointmentTypeSettingsDisableHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    await assertAgendaView(req);
    if (!(await hasSettingsEdit(req.userId!, req))) {
      res.status(403).json({
        error: 'Apenas administrador, gestor ou permissão de edição em Configurações pode gerir tipos de compromisso.',
      });
      return;
    }
    const row = await disableAppointmentTypeSetting(tenantId, id);
    if (!row) {
      res.status(404).json({ error: 'Tipo não encontrado' });
      return;
    }
    res.json({ item: rowToApi(row) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] type-settings disable', e);
    res.status(500).json({ error: 'Erro ao desativar tipo de compromisso' });
  }
}
