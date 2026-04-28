import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { getEffectiveModulePermissions, assertModulePermission, ModulePermissionError } from '../services/modulePermissionsService.js';
import {
  listAppointments,
  listAppointmentConflicts,
  getAppointmentsReportsSummary,
  listAppointmentsByClientForProfile,
  getAppointmentById,
  getRepresentativeAppointmentBySeries,
  createAppointment,
  updateAppointment,
  type AppointmentOutcome,
  completeAppointment,
  cancelAppointment,
  cancelRecurrenceSeries,
  cancelThisAndFollowingRecurrence,
  patchRecurrenceSeries,
  patchThisAndFollowingRecurrence,
  type RecurrenceSeriesPatchInput,
  retrySyncAppointment,
  rescheduleAppointment,
  setAppointmentAttendance,
  requestAppointmentConfirmation,
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
const recurrenceSchema = z
  .object({
    frequency: z.enum(['none', 'weekly', 'monthly', 'weekdays']),
    interval: z.number().int().min(1).max(12).optional(),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
    until: z.string().optional(),
    max_occurrences: z.number().int().min(1).max(100).optional(),
    send_invite_for_all_occurrences: z.boolean().optional(),
  })
  .optional()
  .nullable();

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
    send_reminder_to_client: z.boolean().optional().default(false),
    recurrence: recurrenceSchema,
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
    send_reminder_to_client: z.boolean().optional(),
  })
  .refine((d) => !(d.client_id && d.lead_id), { message: 'Apenas cliente ou lead' });

const completeBody = z.object({
  completion_notes: z.string().max(12000).optional().nullable(),
  outcome: z.enum(['success', 'no_show', 'rescheduled', 'needs_follow_up', 'lost', 'other']),
  create_follow_up: z.boolean().optional().default(false),
  follow_up_starts_at: z.string().optional().nullable(),
  follow_up_ends_at: z.string().optional().nullable(),
  send_client_message: z.boolean().optional().default(false),
});

const recurrencePatchBody = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(20000).optional().nullable(),
    type: z.string().min(1).max(80).optional(),
    responsible_user_id: z.string().uuid().optional().nullable(),
    location: z.string().max(2000).optional().nullable(),
    reminders: z.array(reminderSchema).max(5).optional().nullable(),
    send_reminder_to_client: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo para atualizar' });

const rescheduleBody = z.object({
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  reason: z.string().max(2000).optional().nullable(),
});

const attendanceBody = z.object({
  attendance_status: z.enum(['pending', 'confirmed', 'not_confirmed', 'no_show']),
  attendance_note: z.string().max(2000).optional().nullable(),
});
const requestConfirmationBody = z.object({
  note: z.string().max(2000).optional().nullable(),
});

const conflictsQuery = z.object({
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  responsible_user_id: z.string().uuid(),
  exclude_appointment_id: z.string().uuid().optional(),
});

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
    const rawConfirmationStatus =
      typeof req.query.confirmation_status === 'string' ? req.query.confirmation_status : undefined;
    const allowedConfirmation = new Set([
      'pending',
      'confirmed',
      'not_confirmed',
      'needs_reschedule',
      'declined',
      'no_show',
    ]);
    const confirmationStatus =
      rawConfirmationStatus && allowedConfirmation.has(rawConfirmationStatus)
        ? (rawConfirmationStatus as
            | 'pending'
            | 'confirmed'
            | 'not_confirmed'
            | 'needs_reschedule'
            | 'declined'
            | 'no_show')
        : undefined;
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
      confirmationStatus,
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

export async function getAppointmentConflictsHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const parsed = conflictsQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Parâmetros inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    const perms = await getEffectiveModulePermissions(req.userId);
    const p = perms[MODULE];
    if (p && p.can_view === false) {
      res.status(403).json({ error: 'Sem permissão para ver a Agenda' });
      return;
    }
    const { starts_at, ends_at, responsible_user_id, exclude_appointment_id } = parsed.data;
    if (new Date(ends_at) <= new Date(starts_at)) {
      res.status(400).json({ error: 'O fim deve ser depois do início' });
      return;
    }
    const conflicts = await listAppointmentConflicts({
      tenantId,
      userId: req.userId,
      startsAt: starts_at,
      endsAt: ends_at,
      responsibleUserId: responsible_user_id,
      excludeAppointmentId: exclude_appointment_id,
    });
    res.json({ has_conflict: conflicts.length > 0, conflicts });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] conflicts', e);
    res.status(500).json({ error: 'Erro ao validar conflitos' });
  }
}

export async function getAppointmentsReportsSummaryHandler(req: AuthRequest, res: Response): Promise<void> {
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
    const responsibleUserId =
      typeof req.query.responsible_user_id === 'string' ? req.query.responsible_user_id : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;

    const data = await getAppointmentsReportsSummary({
      tenantId,
      userId: req.userId,
      dateFrom,
      dateTo,
      responsibleUserId,
      type,
    });
    res.json(data);
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] reports summary', e);
    res.status(500).json({ error: 'Erro ao carregar relatório da Agenda' });
  }
}

export async function getAppointmentsByClientHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { clientId } = req.params;
  if (!clientId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    res.status(400).json({ error: 'ID de cliente inválido' });
    return;
  }
  try {
    const perms = await getEffectiveModulePermissions(req.userId);
    const p = perms[MODULE];
    if (p && p.can_view === false) {
      res.status(403).json({ error: 'Sem permissão para ver a Agenda' });
      return;
    }
    const result = await listAppointmentsByClientForProfile({
      tenantId,
      userId: req.userId,
      clientId,
    });
    if (result === null) {
      res.status(404).json({ error: 'Cliente não encontrado' });
      return;
    }
    res.json({ upcoming: result.upcoming, history: result.history });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] by client', e);
    res.status(500).json({ error: 'Erro ao listar compromissos do cliente' });
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
    const created = await createAppointment(tenantId, req.userId, {
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
      send_reminder_to_client: d.send_reminder_to_client,
      recurrence: d.recurrence ?? undefined,
    });
    res.status(201).json({
      ...created.primary,
      attendees: await listAttendees(created.primary.id),
      recurrence_created_count: created.createdCount,
      recurrence_warnings: created.warnings,
    });
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
    await assertModulePermission(req.userId, MODULE, 'delete', {
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

export async function postRecurrenceSeriesCancelHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { seriesId } = req.params;
  if (!seriesId) {
    res.status(400).json({ error: 'ID da série inválido' });
    return;
  }
  try {
    const representative = await getRepresentativeAppointmentBySeries(tenantId, seriesId);
    if (!representative) {
      res.status(404).json({ error: 'Série recorrente não encontrada' });
      return;
    }
    const p = (await getEffectiveModulePermissions(req.userId))[MODULE];
    const visible = await getAppointmentById(tenantId, representative.id, req.userId, p);
    if (!visible) {
      res.status(404).json({ error: 'Série recorrente não encontrada' });
      return;
    }
    await assertModulePermission(req.userId, MODULE, 'delete', {
      ownerId: representative.created_by,
      assigneeId: representative.responsible_user_id,
    });
    const result = await cancelRecurrenceSeries(tenantId, req.userId, seriesId);
    res.json(result);
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] cancel series', e);
    res.status(500).json({ error: 'Erro ao cancelar série recorrente' });
  }
}

export async function postAppointmentCancelFollowingHandler(req: AuthRequest, res: Response): Promise<void> {
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
    await assertModulePermission(req.userId, MODULE, 'delete', {
      ownerId: existing.created_by,
      assigneeId: existing.responsible_user_id,
    });
    const result = await cancelThisAndFollowingRecurrence(tenantId, req.userId, id);
    res.json(result);
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] cancel following', e);
    res.status(400).json({ error: e instanceof Error ? e.message : 'Erro ao cancelar ocorrências futuras' });
  }
}

export async function patchRecurrenceSeriesHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { seriesId } = req.params;
  if (!seriesId) {
    res.status(400).json({ error: 'ID da série inválido' });
    return;
  }
  const parsed = recurrencePatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    await assertModulePermission(req.userId, MODULE, 'edit');
    const result = await patchRecurrenceSeries(
      tenantId,
      req.userId,
      seriesId,
      parsed.data as RecurrenceSeriesPatchInput,
    );
    res.json(result);
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] patch series', e);
    res.status(500).json({ error: 'Erro ao editar série recorrente' });
  }
}

export async function patchAppointmentThisAndFollowingHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = recurrencePatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
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
    const result = await patchThisAndFollowingRecurrence(
      tenantId,
      req.userId,
      id,
      parsed.data as RecurrenceSeriesPatchInput,
    );
    res.json(result);
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[appointments] patch following', e);
    res.status(400).json({ error: e instanceof Error ? e.message : 'Erro ao editar ocorrências futuras' });
  }
}

export async function postAppointmentCompleteHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = completeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
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
    const b = parsed.data;
    if (b.create_follow_up && (!b.follow_up_starts_at || !b.follow_up_ends_at)) {
      res.status(400).json({ error: 'Data e hora do follow-up são obrigatórias.' });
      return;
    }
    const result = await completeAppointment({
      tenantId,
      userId: req.userId,
      id,
      completionNotes: b.completion_notes,
      outcome: b.outcome as AppointmentOutcome,
      createFollowUp: b.create_follow_up === true,
      followUpStartsAt: b.follow_up_starts_at ?? null,
      followUpEndsAt: b.follow_up_ends_at ?? null,
      sendClientMessage: b.send_client_message === true,
    });
    res.json({
      ...result.appointment,
      attendees: await listAttendees(result.appointment.id),
      follow_up: result.followUp
        ? { ...result.followUp, attendees: await listAttendees(result.followUp.id) }
        : null,
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : 'Erro ao concluir compromisso';
    const code =
      msg.includes('obrigatóri') || msg.includes('inválid') || msg.includes('Apenas compromissos')
        ? 400
        : 500;
    console.error('[appointments] complete', e);
    res.status(code).json({ error: msg });
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

export async function postAppointmentRescheduleHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = rescheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  if (new Date(parsed.data.ends_at) <= new Date(parsed.data.starts_at)) {
    res.status(400).json({ error: 'A hora de fim deve ser depois do início' });
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
    const row = await rescheduleAppointment({
      tenantId,
      userId: req.userId,
      id,
      startsAt: parsed.data.starts_at,
      endsAt: parsed.data.ends_at,
      reason: parsed.data.reason ?? null,
    });
    if (!row) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json({ ...row, attendees: await listAttendees(id) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    const msg = e instanceof Error ? e.message : 'Erro ao reagendar';
    res.status(400).json({ error: msg });
  }
}

export async function postAppointmentAttendanceHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = attendanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
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
    const row = await setAppointmentAttendance({
      tenantId,
      userId: req.userId,
      id,
      attendanceStatus: parsed.data.attendance_status,
      attendanceNote: parsed.data.attendance_note ?? null,
    });
    if (!row) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    res.json({ ...row, attendees: await listAttendees(id) });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    res.status(400).json({ error: e instanceof Error ? e.message : 'Erro ao atualizar presença' });
  }
}

export async function postAppointmentRequestConfirmationHandler(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'ID inválido' });
    return;
  }
  const parsed = requestConfirmationBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
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
    const result = await requestAppointmentConfirmation({
      tenantId,
      userId: req.userId,
      id,
      note: parsed.data.note ?? null,
    });
    res.json({
      ...result.appointment,
      attendees: await listAttendees(id),
      confirmation_dispatch: result.dispatch,
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    res.status(400).json({ error: e instanceof Error ? e.message : 'Erro ao solicitar confirmação' });
  }
}
