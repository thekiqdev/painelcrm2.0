import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { getEffectiveModulePermissions, assertModulePermission, ModulePermissionError } from '../services/modulePermissionsService.js';
import {
  listAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  retrySyncAppointment,
  listAttendees,
} from '../services/appointmentsService.js';

const MODULE = 'agenda' as const;

const attendeeSchema = z.object({
  name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  attendee_type: z.string().optional().default('external'),
});

const reminderSchema = z.object({ method: z.enum(['email', 'popup']), minutes: z.number().int().min(0).max(40320) });

const createBody = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(20000).optional().nullable(),
    type: z.string().min(1).max(80).default('meeting'),
    client_id: z.string().uuid().optional().nullable(),
    lead_id: z.string().uuid().optional().nullable(),
    responsible_user_id: z.string().uuid().optional().nullable(),
    starts_at: z.string().min(1),
    ends_at: z.string().min(1),
    location: z.string().max(2000).optional().nullable(),
    create_google_event: z.boolean().optional().default(false),
    create_meet: z.boolean().optional().default(false),
    attendees: z.array(attendeeSchema).optional(),
    reminders: z.array(reminderSchema).max(5).optional().nullable(),
  })
  .refine((d) => !(d.client_id && d.lead_id), { message: 'Apenas cliente ou lead' });

const patchBody = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(20000).optional().nullable(),
    type: z.string().min(1).max(80).optional(),
    client_id: z.string().uuid().optional().nullable(),
    lead_id: z.string().uuid().optional().nullable(),
    responsible_user_id: z.string().uuid().optional().nullable(),
    starts_at: z.string().optional(),
    ends_at: z.string().optional(),
    location: z.string().max(2000).optional().nullable(),
    create_google_event: z.boolean().optional(),
    create_meet: z.boolean().optional(),
    attendees: z.array(attendeeSchema).optional(),
    reminders: z.array(reminderSchema).max(5).optional().nullable(),
  })
  .refine((d) => !(d.client_id && d.lead_id), { message: 'Apenas cliente ou lead' });

export async function getAppointmentsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  try {
    const perms = await getEffectiveModulePermissions(req.userId);
    const p = perms[MODULE];
    if (p && p.can_view === false) {
      res.status(403).json({ error: 'Sem permissão para ver a Agenda' });
      return;
    }
    const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : undefined;
    const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : undefined;
    const responsible = typeof req.query.responsible_user_id === 'string' ? req.query.responsible_user_id : undefined;
    const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : undefined;
    const leadId = typeof req.query.lead_id === 'string' ? req.query.lead_id : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const { items, total } = await listAppointments({
      tenantId,
      userId: req.userId,
      dateFrom,
      dateTo,
      responsibleUserId: responsible,
      clientId,
      leadId,
      status,
      type,
      limit,
      offset,
    });
    res.json({ items, total, limit, offset });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] list', e);
    res.status(500).json({ error: 'Erro ao listar compromissos' });
  }
}

export async function getAppointmentByIdHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    const perms = await getEffectiveModulePermissions(req.userId);
    const p = perms[MODULE];
    if (p && p.can_view === false) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }
    const row = await getAppointmentById(tenantId, id, req.userId, p);
    if (!row) {
      res.status(404).json({ error: 'Compromisso não encontrado' });
      return;
    }
    const attendees = await listAttendees(id);
    res.json({ ...row, attendees });
  } catch (e) {
    console.error('[appointments] get', e);
    res.status(500).json({ error: 'Erro ao carregar' });
  }
}

export async function postAppointmentHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    await assertModulePermission(req.userId, MODULE, 'create');
    const d = parsed.data;
    if (d.client_id && d.lead_id) {
      res.status(400).json({ error: 'Informe apenas cliente ou lead' });
      return;
    }
    const row = await createAppointment(tenantId, req.userId, {
      title: d.title,
      description: d.description,
      type: d.type,
      client_id: d.client_id,
      lead_id: d.lead_id,
      responsible_user_id: d.responsible_user_id,
      starts_at: d.starts_at,
      ends_at: d.ends_at,
      location: d.location,
      create_google_event: d.create_google_event,
      create_meet: d.create_meet,
      attendees: d.attendees,
      reminders: d.reminders,
    });
    res.status(201).json({ ...row, attendees: await listAttendees(row.id) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const m = e instanceof Error ? e.message : 'Erro';
    if (m.includes('Informe')) {
      res.status(400).json({ error: m });
      return;
    }
    console.error('[appointments] create', e);
    res.status(400).json({ error: m || 'Erro ao criar' });
  }
}

export async function patchAppointmentHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const perms0 = await getEffectiveModulePermissions(req.userId);
    const existing = await getAppointmentById(tenantId, id, req.userId, perms0[MODULE]);
    if (!existing) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    const p = perms0[MODULE];
    await assertModulePermission(req.userId, MODULE, 'edit', {
      ownerId: existing.created_by,
      assigneeId: existing.responsible_user_id,
    });
    const d = parsed.data;
    if (d.client_id && d.lead_id) {
      res.status(400).json({ error: 'Informe apenas cliente ou lead' });
      return;
    }
    const row = await updateAppointment(tenantId, req.userId, id, {
      ...d,
    });
    res.json({ ...row, attendees: await listAttendees(id) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] patch', e);
    res.status(400).json({ error: e instanceof Error ? e.message : 'Erro' });
  }
}

export async function postAppointmentCancelHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  try {
    const p = (await getEffectiveModulePermissions(req.userId))[MODULE];
    const existing = await getAppointmentById(tenantId, id, req.userId, p);
    if (!existing) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    await assertModulePermission(req.userId, MODULE, 'edit', {
      ownerId: existing.created_by,
      assigneeId: existing.responsible_user_id,
    });
    const row = await cancelAppointment(tenantId, req.userId, id);
    res.json({ ...row, attendees: await listAttendees(id) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] cancel', e);
    res.status(500).json({ error: 'Erro ao cancelar' });
  }
}

export async function postAppointmentRetrySyncHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const createMeet = req.body && typeof (req.body as { create_meet?: boolean }).create_meet === 'boolean'
    ? (req.body as { create_meet?: boolean }).create_meet
    : undefined;
  try {
    const p = (await getEffectiveModulePermissions(req.userId))[MODULE];
    const existing = await getAppointmentById(tenantId, id, req.userId, p);
    if (!existing) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    await assertModulePermission(req.userId, MODULE, 'edit', {
      ownerId: existing.created_by,
      assigneeId: existing.responsible_user_id,
    });
    if (!existing.create_google_event) {
      res.status(400).json({ error: 'Compromisso sem opção de Google' });
      return;
    }
    if (existing.sync_status !== 'error' && existing.sync_status !== 'not_synced') {
      res.json({ message: 'Nada a retentar', item: { ...existing, attendees: await listAttendees(id) } });
      return;
    }
    const row = await retrySyncAppointment(tenantId, req.userId, id, createMeet);
    res.json({ ...row, attendees: await listAttendees(id) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] retry', e);
    res.status(500).json({ error: 'Erro ao sincronizar' });
  }
}
