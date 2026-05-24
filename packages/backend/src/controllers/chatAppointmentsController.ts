import type { Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantId } from '../middleware/auth.js';
import { SQL_CHAT_ACCESS_PREDICATE } from '../utils/chatConversationAccess.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { canChatAction } from '../services/chatAccess.js';
import { createAppointment } from '../services/appointmentsService.js';
import { loadConnectionForUser } from '../services/googleCalendarService.js';
import { sendKanbanAutomationOutboundText } from './chatController.js';
import { createClientTimelineEvent } from '../services/clientTimelineEventsService.js';
import { getDefaultDurationMinutesForAppointmentType } from '../services/appointmentTypeSettingsService.js';

const AGENDA_MODULE = 'agenda' as const;

let leadColumnPromise: Promise<boolean> | null = null;
async function conversationsHaveLeadIdColumn(): Promise<boolean> {
  if (!leadColumnPromise) {
    leadColumnPromise = (async () => {
      const r = await pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'lead_id'`,
      );
      return (r.rows[0]?.c ?? '0') === '1';
    })();
  }
  return leadColumnPromise;
}

type ConversationForAgendaRow = {
  id: string;
  client_id: string | null;
  lead_id: string | null;
  display_name: string | null;
  contact_name: string | null;
  profile_name: string | null;
  phone_number: string | null;
  status: string | null;
};

function roundUpToNext5Minutes(d: Date): Date {
  const step = 5 * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

function resolveContactFirstName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return 'aí';
  const first = t.split(/\s+/)[0];
  return first || t;
}

function buildMeetNowChatMessage(contactLabel: string, meetLink: string): string {
  const nome = resolveContactFirstName(contactLabel);
  return `Olá, ${nome}! Criei nossa reunião agora.\n\nAcesse pelo link:\n${meetLink}`;
}

function buildScheduledChatMessage(params: {
  contactLabel: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  meetLink?: string | null;
}): string {
  const nome = resolveContactFirstName(params.contactLabel);
  let body = `Olá, ${nome}! Seu compromisso foi agendado.\n\n`;
  if (params.title.trim()) {
    body += `${params.title.trim()}\n\n`;
  }
  body += `Data: ${params.dateLabel}\n`;
  body += `Horário: ${params.timeLabel}`;
  if (params.meetLink?.trim()) {
    body += `\n\n${params.meetLink.trim()}`;
  }
  return body;
}

async function loadConversationForAgenda(
  conversationId: string,
  actorUserId: string,
): Promise<ConversationForAgendaRow | null> {
  const hasLead = await conversationsHaveLeadIdColumn();
  const leadSel = hasLead ? 'c.lead_id' : 'NULL::uuid AS lead_id';
  const r = await pool.query<ConversationForAgendaRow>(
    `
    SELECT c.id, c.client_id, ${leadSel}, c.display_name, c.contact_name, c.profile_name, c.phone_number, c.status
    FROM chat_conversations c
    INNER JOIN chat_instances i ON i.id = c.instance_id
    WHERE c.id = $1 AND ${SQL_CHAT_ACCESS_PREDICATE}
    `,
    [conversationId, actorUserId],
  );
  return r.rows[0] ?? null;
}

function conversationContactLabel(row: ConversationForAgendaRow): string {
  return (
    row.display_name?.trim() ||
    row.contact_name?.trim() ||
    row.profile_name?.trim() ||
    row.phone_number?.trim() ||
    'Cliente'
  );
}

async function loadClientContactFields(
  tenantId: string,
  clientId: string,
): Promise<{ name: string | null; email: string | null; phone: string | null } | null> {
  const r = await pool.query<{ name: string | null; email: string | null; phone: string | null }>(
    `SELECT c.name, c.email, c.phone
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE c.id = $2
     LIMIT 1`,
    [tenantId, clientId],
  );
  return r.rows[0] ?? null;
}

async function recordChatAppointmentTimeline(params: {
  tenantId: string;
  clientId: string;
  actorUserId: string;
  appointmentId: string;
  conversationId: string;
  meetLink: string | null;
}): Promise<void> {
  await createClientTimelineEvent({
    tenantId: params.tenantId,
    clientId: params.clientId,
    eventName: 'chat_appointment_scheduled',
    source: 'chat',
    actorType: 'user',
    actorId: params.actorUserId,
    referenceType: 'appointment',
    referenceId: params.appointmentId,
    eventKey: `chat:appointment:${params.appointmentId}:scheduled`,
    metadata: {
      conversation_id: params.conversationId,
      appointment_id: params.appointmentId,
      meet_link: params.meetLink,
      created_by: params.actorUserId,
    },
  });
}

const meetNowBodySchema = z.object({
  duration_minutes: z.number().int().min(15).max(480).optional(),
  title: z.string().min(1).max(500).optional(),
});

const chatReminderSchema = z.object({
  method: z.enum(['email', 'popup']),
  minutes: z.number().int().min(0).max(40320),
});

const scheduleFromChatBodySchema = z.object({
  title: z.string().min(1).max(500),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  type: z.string().min(1).max(80).default('meeting'),
  description: z.string().max(20000).optional().nullable(),
  create_google_event: z.boolean().optional().default(true),
  create_meet: z.boolean().optional().default(true),
  send_chat_confirmation: z.boolean().optional().default(true),
  reminders: z.array(chatReminderSchema).optional().nullable(),
  send_reminder_to_client: z.boolean().optional().default(true),
});

export async function postChatConversationCreateMeetNow(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id: conversationId } = req.params;
  if (!conversationId) {
    res.status(400).json({ error: 'ID da conversa inválido' });
    return;
  }
  const parsed = meetNowBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  try {
    if (!(await canChatAction(req.userId, 'schedule_from_chat', req))) {
      res.status(403).json({ error: 'Sem permissão para agendar pelo chat.' });
      return;
    }
    await assertModulePermission(req.userId, AGENDA_MODULE, 'create');
    if (!(await canChatAction(req.userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão para enviar mensagens nesta conversa' });
      return;
    }

    const conv = await loadConversationForAgenda(conversationId, req.userId);
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const st = String(conv.status || '').toLowerCase();
    if (st === 'archived') {
      res.status(409).json({ error: 'Conversa arquivada' });
      return;
    }

    if (!conv.client_id && !conv.lead_id) {
      res.status(400).json({
        error: 'Vincule um cliente ou lead a esta conversa para criar a reunião.',
        code: 'needs_client_or_lead',
      });
      return;
    }

    const conn = await loadConnectionForUser(tenantId, req.userId);
    if (!conn) {
      res.status(400).json({
        error: 'Conecte o Google Agenda nas configurações para criar reunião com Meet.',
        code: 'google_not_connected',
      });
      return;
    }

    const duration =
      parsed.data.duration_minutes ??
      (await getDefaultDurationMinutesForAppointmentType(tenantId, 'meeting'));
    const start = roundUpToNext5Minutes(new Date());
    const end = new Date(start.getTime() + duration * 60_000);
    const label = conversationContactLabel(conv);
    const title =
      parsed.data.title?.trim() ||
      `Reunião com ${label}`;

    const attendees: { name?: string | null; email?: string | null; phone?: string | null; attendee_type?: string }[] =
      [];
    if (conv.client_id) {
      const c = await loadClientContactFields(tenantId, conv.client_id);
      if (c && (c.email || c.phone || c.name)) {
        attendees.push({
          name: c.name,
          email: c.email,
          phone: c.phone,
          attendee_type: 'external',
        });
      }
    }

    const created = await createAppointment(tenantId, req.userId, {
      title,
      description: 'Criada a partir do chat',
      type: 'meeting',
      client_id: conv.client_id,
      lead_id: conv.lead_id,
      responsible_user_id: req.userId,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      create_google_event: true,
      create_meet: true,
      send_reminder_to_client: false,
      attendees,
      skip_initial_client_timeline: true,
    });

    const ap = created.primary;
    const meetLink = ap.google_meet_link ?? null;
    let messageSent = false;
    let messageError: string | null = null;

    if (meetLink) {
      const text = buildMeetNowChatMessage(label, meetLink);
      const send = await sendKanbanAutomationOutboundText({
        actorUserId: req.userId,
        conversationId: conv.id,
        text,
        metadataSource: 'chat_appointment_meet_now',
      });
      messageSent = send.ok;
      messageError = send.ok ? null : send.error ?? 'send_failed';
    } else {
      messageError = 'meet_link_unavailable';
    }

    if (conv.client_id) {
      void recordChatAppointmentTimeline({
        tenantId,
        clientId: conv.client_id,
        actorUserId: req.userId,
        appointmentId: ap.id,
        conversationId: conv.id,
        meetLink,
      }).catch(() => {});
    }

    res.status(201).json({
      appointment: ap,
      meet_link: meetLink,
      message_sent: messageSent,
      message_error: messageError,
      warnings: created.warnings,
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[chat-appointments] meet-now', e);
    res.status(400).json({ error: e instanceof Error ? e.message : 'Erro ao criar reunião' });
  }
}

export async function postChatConversationScheduleAppointment(req: AuthRequest, res: Response): Promise<void> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId || !req.userId) return;
  const { id: conversationId } = req.params;
  if (!conversationId) {
    res.status(400).json({ error: 'ID da conversa inválido' });
    return;
  }
  const parsed = scheduleFromChatBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;

  try {
    if (!(await canChatAction(req.userId, 'schedule_from_chat', req))) {
      res.status(403).json({ error: 'Sem permissão para agendar pelo chat.' });
      return;
    }
    await assertModulePermission(req.userId, AGENDA_MODULE, 'create');
    if (d.send_chat_confirmation && !(await canChatAction(req.userId, 'reply', req))) {
      res.status(403).json({ error: 'Sem permissão para enviar mensagens nesta conversa' });
      return;
    }

    const conv = await loadConversationForAgenda(conversationId, req.userId);
    if (!conv) {
      res.status(404).json({ error: 'Conversa não encontrada' });
      return;
    }
    const st = String(conv.status || '').toLowerCase();
    if (st === 'archived') {
      res.status(409).json({ error: 'Conversa arquivada' });
      return;
    }
    if (!conv.client_id && !conv.lead_id) {
      res.status(400).json({
        error: 'Vincule um cliente ou lead a esta conversa para agendar.',
        code: 'needs_client_or_lead',
      });
      return;
    }

    if (d.create_google_event && d.create_meet) {
      const conn = await loadConnectionForUser(tenantId, req.userId);
      if (!conn) {
        res.status(400).json({
          error: 'Conecte o Google Agenda para criar evento com Meet.',
          code: 'google_not_connected',
        });
        return;
      }
    }

    const label = conversationContactLabel(conv);
    const attendees: { name?: string | null; email?: string | null; phone?: string | null; attendee_type?: string }[] =
      [];
    if (conv.client_id) {
      const c = await loadClientContactFields(tenantId, conv.client_id);
      if (c && (c.email || c.phone || c.name)) {
        attendees.push({
          name: c.name,
          email: c.email,
          phone: c.phone,
          attendee_type: 'external',
        });
      }
    }

    const sendReminderToClient = d.send_reminder_to_client === true;
    const created = await createAppointment(tenantId, req.userId, {
      title: d.title,
      description: d.description ?? 'Agendado a partir do chat',
      type: d.type,
      client_id: conv.client_id,
      lead_id: conv.lead_id,
      responsible_user_id: req.userId,
      starts_at: d.starts_at,
      ends_at: d.ends_at,
      create_google_event: d.create_google_event,
      create_meet: d.create_meet,
      reminders: d.reminders ?? null,
      send_reminder_to_client: sendReminderToClient,
      attendees,
      skip_initial_client_timeline: true,
      skip_client_invite_notification: d.send_chat_confirmation === true && sendReminderToClient,
    });

    const ap = created.primary;
    const meetLink = ap.google_meet_link ?? null;

    let messageSent = false;
    let messageError: string | null = null;
    if (d.send_chat_confirmation) {
      const startD = new Date(d.starts_at);
      const dateLabel = startD.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeLabel = `${startD.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – ${new Date(d.ends_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const text = buildScheduledChatMessage({
        contactLabel: label,
        title: d.title,
        dateLabel,
        timeLabel,
        meetLink: d.create_meet ? meetLink : null,
      });
      const send = await sendKanbanAutomationOutboundText({
        actorUserId: req.userId,
        conversationId: conv.id,
        text,
        metadataSource: 'chat_appointment_scheduled',
      });
      messageSent = send.ok;
      messageError = send.ok ? null : send.error ?? 'send_failed';
    }

    if (conv.client_id) {
      void recordChatAppointmentTimeline({
        tenantId,
        clientId: conv.client_id,
        actorUserId: req.userId,
        appointmentId: ap.id,
        conversationId: conv.id,
        meetLink: meetLink ?? null,
      }).catch(() => {});
    }

    res.status(201).json({
      appointment: ap,
      meet_link: meetLink,
      message_sent: messageSent,
      message_error: messageError,
      warnings: created.warnings,
    });
  } catch (e) {
    if (e instanceof ModulePermissionError) {
      res.status(e.statusCode).json({ error: e.message });
      return;
    }
    console.error('[chat-appointments] schedule', e);
    res.status(400).json({ error: e instanceof Error ? e.message : 'Erro ao agendar' });
  }
}
