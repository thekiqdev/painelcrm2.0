/**
 * Agenda → motor transacional WhatsApp (convite e lembrete ao cliente).
 * Reutiliza runTransactionalNotification; não chama UazAPI diretamente.
 */
import type { Pool } from 'pg';
import {
  runTransactionalNotification,
  isSkippedByTenantPreference,
} from './notificationEngineOrchestrator.js';
import { resolveWhatsAppSenderUserIdForTenant } from './whatsappSenderResolve.js';
import { resolveWhatsAppRoutingForEventKey } from './whatsappInstanceRoutingService.js';
import {
  isNotificationsEngineBusinessEventsEnabled,
  isNotificationsEngineEnabled,
  isBusinessNotificationEventKeyAllowed,
  isBusinessNotificationPilotTenantAllowed,
} from '../../config/notificationsEngineEnv.js';
import { neLogWarn } from './notificationEngineLog.js';

/** Campos mínimos para merge / envio (evita dependência circular com appointmentsService). */
export type AppointmentNotifyPayload = {
  id: string;
  tenant_id: string;
  title: string;
  starts_at: string;
  client_id: string | null;
  lead_id: string | null;
  responsible_user_id: string | null;
  created_by: string | null;
  google_meet_link: string | null;
  location?: string | null;
  send_reminder_to_client?: boolean;
};

const TZ = 'America/Sao_Paulo';

function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length < 10) return null;
  return d;
}

function formatDatePt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: TZ });
}

function formatTimePt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

async function loadRecipientForAppointment(
  pool: Pool,
  tenantId: string,
  clientId: string | null,
  leadId: string | null,
): Promise<{ nome: string; phone: string } | null> {
  if (clientId) {
    const r = await pool.query<{ name: string | null; phone: string | null }>(
      `SELECT c.name, c.phone
       FROM public.clients c
       INNER JOIN public.users u ON u.id = c.user_id
       WHERE c.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [clientId, tenantId],
    );
    const row = r.rows[0];
    if (row) {
      const ph = normalizeWhatsappPhone(row.phone);
      if (ph) {
        return { nome: row.name?.trim() || 'Cliente', phone: ph };
      }
    }
  }
  if (leadId) {
    const r = await pool.query<{ name: string | null; phone: string | null }>(
      `SELECT l.name, l.phone
       FROM public.leads l
       INNER JOIN public.users u ON u.id = l.user_id
       WHERE l.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [leadId, tenantId],
    );
    const row = r.rows[0];
    if (row) {
      const ph = normalizeWhatsappPhone(row.phone);
      if (ph) {
        return { nome: row.name?.trim() || 'Lead', phone: ph };
      }
    }
  }
  return null;
}

async function loadResponsibleLabel(pool: Pool, responsibleUserId: string | null): Promise<string> {
  if (!responsibleUserId) return '—';
  const r = await pool.query<{ email: string | null }>(
    `SELECT email FROM public.users WHERE id = $1 LIMIT 1`,
    [responsibleUserId],
  );
  const e = r.rows[0]?.email?.trim();
  return e || '—';
}

async function gateAndPublishAppointment(params: {
  pool: Pool;
  eventKey: 'appointment.invited' | 'appointment.reminder' | 'appointment.completed';
  tenantId: string;
  preferredSenderUserId: string | null | undefined;
  actorUserId: string;
  entityId: string | null;
  idempotencyKey: string;
  recipientPhone: string | null;
  recipientType: string;
  mergeContext: Record<string, string>;
  eventOccurredAt: Date | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  if (!isNotificationsEngineEnabled()) {
    neLogWarn('notifications_engine_disabled', { tenant_id: params.tenantId, event_key: params.eventKey });
    return;
  }
  if (!isNotificationsEngineBusinessEventsEnabled()) {
    neLogWarn('business_events_disabled', { tenant_id: params.tenantId, event_key: params.eventKey });
    return;
  }
  if (!isBusinessNotificationPilotTenantAllowed(params.tenantId)) {
    neLogWarn('tenant_not_allowed', { tenant_id: params.tenantId, event_key: params.eventKey });
    return;
  }
  if (!isBusinessNotificationEventKeyAllowed(params.eventKey)) {
    neLogWarn('event_key_not_allowed', {
      tenant_id: params.tenantId,
      event_key: params.eventKey,
    });
    return;
  }

  const phone = normalizeWhatsappPhone(params.recipientPhone);
  if (!phone) {
    if (!params.recipientPhone || !String(params.recipientPhone).trim()) {
      neLogWarn('missing_client_phone', { tenant_id: params.tenantId, event_key: params.eventKey });
    } else {
      neLogWarn('invalid_phone', { tenant_id: params.tenantId, event_key: params.eventKey });
    }
    return;
  }

  let senderUserId: string | null = null;
  let chatInstanceId: string | null = null;

  const routed = await resolveWhatsAppRoutingForEventKey(params.pool, params.tenantId, params.eventKey);
  if (routed) {
    senderUserId = routed.sender_user_id;
    chatInstanceId = routed.chat_instance_id;
  } else {
    senderUserId = await resolveWhatsAppSenderUserIdForTenant(
      params.pool,
      params.tenantId,
      params.preferredSenderUserId,
    );
  }
  if (!senderUserId) {
    neLogWarn('missing_whatsapp_sender', { tenant_id: params.tenantId, event_key: params.eventKey });
    return;
  }

  const result = await runTransactionalNotification({
    pool: params.pool,
    tenantId: params.tenantId,
    senderUserId,
    eventKey: params.eventKey,
    entityType: 'appointment',
    entityId: params.entityId,
    idempotencyKey: params.idempotencyKey,
    recipientPhone: phone,
    recipientType: params.recipientType,
    mergeContext: params.mergeContext,
    eventOccurredAt: params.eventOccurredAt,
    actor: { type: 'user', user_id: params.actorUserId },
    metadata: {
      ...params.metadata,
      whatsapp_routing_source: chatInstanceId ? 'explicit' : 'fallback',
      ...(chatInstanceId ? { whatsapp_routed_chat_instance_id: chatInstanceId } : {}),
    },
    chatInstanceId,
  });

  if (!result.ok) {
    neLogWarn('whatsapp_dispatch_failed', {
      tenant_id: params.tenantId,
      event_key: params.eventKey,
      error: result.error,
    });
    console.error(`[appointmentTransactionalNotifications] ${params.eventKey}`, result.error, result.details);
    return;
  }
  if (isSkippedByTenantPreference(result)) {
    neLogWarn('notification_disabled_by_tenant', {
      tenant_id: params.tenantId,
      event_key: params.eventKey,
    });
    return;
  }
}

/**
 * Convite ao criar compromisso (send_reminder_to_client = preferência “comunicar cliente”).
 */
export async function publishAppointmentInvite(params: {
  pool: Pool;
  tenantId: string;
  actorUserId: string;
  appointment: AppointmentNotifyPayload;
}): Promise<void> {
  const a = params.appointment;
  if (!a.send_reminder_to_client) return;

  const recipient = await loadRecipientForAppointment(params.pool, params.tenantId, a.client_id, a.lead_id);
  if (!recipient) return;

  const responsavel = await loadResponsibleLabel(params.pool, a.responsible_user_id);
  const meetLink = (a.google_meet_link ?? '').trim();

  await gateAndPublishAppointment({
    pool: params.pool,
    eventKey: 'appointment.invited',
    tenantId: params.tenantId,
    preferredSenderUserId: a.responsible_user_id ?? a.created_by ?? params.actorUserId,
    actorUserId: params.actorUserId,
    entityId: a.id,
    idempotencyKey: `appointment:${a.id}:invite`,
    recipientPhone: recipient.phone,
    recipientType: a.client_id ? 'client' : 'lead',
    mergeContext: {
      nome: recipient.nome,
      titulo: a.title,
      data: formatDatePt(a.starts_at),
      hora: formatTimePt(a.starts_at),
      responsavel,
      meet_link: meetLink,
    },
    eventOccurredAt: new Date(),
    metadata: {
      engine: 'notifications_engine',
      module: 'agenda',
      appointment_id: a.id,
      kind: 'invite',
    },
  });
}

/**
 * Lembrete WhatsApp ao cliente (mesma janela temporal dos lembretes internos).
 */
export async function publishAppointmentClientReminder(params: {
  pool: Pool;
  tenantId: string;
  appointment: AppointmentNotifyPayload;
  reminderType: '10m' | '30m' | '60m' | '1440m';
}): Promise<void> {
  const a = params.appointment;
  if (!a.send_reminder_to_client) return;

  const recipient = await loadRecipientForAppointment(params.pool, params.tenantId, a.client_id, a.lead_id);
  if (!recipient) return;

  const actorUserId = a.responsible_user_id || a.created_by;
  if (!actorUserId) return;

  const meetLink = (a.google_meet_link ?? '').trim();

  await gateAndPublishAppointment({
    pool: params.pool,
    eventKey: 'appointment.reminder',
    tenantId: params.tenantId,
    preferredSenderUserId: a.responsible_user_id ?? a.created_by,
    actorUserId,
    entityId: a.id,
    idempotencyKey: `appointment:${a.id}:reminder:${params.reminderType}`,
    recipientPhone: recipient.phone,
    recipientType: a.client_id ? 'client' : 'lead',
    mergeContext: {
      nome: recipient.nome,
      titulo: a.title,
      hora: formatTimePt(a.starts_at),
      meet_link: meetLink,
    },
    eventOccurredAt: new Date(a.starts_at),
    metadata: {
      engine: 'notifications_engine',
      module: 'agenda',
      appointment_id: a.id,
      kind: 'client_reminder',
      reminder_type: params.reminderType,
    },
  });
}

/**
 * Pós-compromisso: resumo ao cliente (opcional, controlado no modal de conclusão).
 */
export async function publishAppointmentCompleted(params: {
  pool: Pool;
  tenantId: string;
  actorUserId: string;
  appointment: AppointmentNotifyPayload;
  completionNotes: string;
  followUpStartsAt?: string | null;
}): Promise<void> {
  const a = params.appointment;
  const recipient = await loadRecipientForAppointment(params.pool, params.tenantId, a.client_id, a.lead_id);
  if (!recipient) return;

  const responsavel = await loadResponsibleLabel(params.pool, a.responsible_user_id);
  const followDate = params.followUpStartsAt ? formatDatePt(params.followUpStartsAt) : '';
  const followTime = params.followUpStartsAt ? formatTimePt(params.followUpStartsAt) : '';
  const resumo = params.completionNotes?.trim() || 'Reunião concluída com sucesso.';

  await gateAndPublishAppointment({
    pool: params.pool,
    eventKey: 'appointment.completed',
    tenantId: params.tenantId,
    preferredSenderUserId: a.responsible_user_id ?? a.created_by ?? params.actorUserId,
    actorUserId: params.actorUserId,
    entityId: a.id,
    idempotencyKey: `appointment:${a.id}:completed`,
    recipientPhone: recipient.phone,
    recipientType: a.client_id ? 'client' : 'lead',
    mergeContext: {
      nome: recipient.nome,
      titulo: a.title,
      responsavel,
      resumo,
      proximo_followup_data: followDate ? `Próximo follow-up: ${followDate}` : '',
      proximo_followup_hora: followTime ? `Horário: ${followTime}` : '',
    },
    eventOccurredAt: new Date(),
    metadata: {
      engine: 'notifications_engine',
      module: 'agenda',
      appointment_id: a.id,
      kind: 'completed_summary',
      has_follow_up: Boolean(params.followUpStartsAt),
    },
  });
}

export type ConfirmationRequestDispatchResult = {
  ok: boolean;
  status: 'sent' | 'skipped' | 'failed';
  reason?:
    | 'notifications_engine_disabled'
    | 'business_events_disabled'
    | 'tenant_not_allowed'
    | 'event_key_not_allowed'
    | 'missing_client_phone'
    | 'invalid_phone'
    | 'missing_whatsapp_sender'
    | 'notification_disabled_by_tenant'
    | 'whatsapp_dispatch_failed';
  delivery_id?: string | null;
  error?: string;
};

export async function publishAppointmentConfirmationRequest(params: {
  pool: Pool;
  tenantId: string;
  actorUserId: string;
  appointment: AppointmentNotifyPayload;
  confirmationLink: string;
}): Promise<ConfirmationRequestDispatchResult> {
  const a = params.appointment;
  const recipient = await loadRecipientForAppointment(params.pool, params.tenantId, a.client_id, a.lead_id);
  if (!recipient) {
    return { ok: false, status: 'failed', reason: 'missing_client_phone' };
  }
  if (!isNotificationsEngineEnabled()) return { ok: false, status: 'failed', reason: 'notifications_engine_disabled' };
  if (!isNotificationsEngineBusinessEventsEnabled()) return { ok: false, status: 'failed', reason: 'business_events_disabled' };
  if (!isBusinessNotificationPilotTenantAllowed(params.tenantId)) return { ok: false, status: 'failed', reason: 'tenant_not_allowed' };
  if (!isBusinessNotificationEventKeyAllowed('appointment.confirmation_request')) {
    return { ok: false, status: 'failed', reason: 'event_key_not_allowed' };
  }

  const phone = normalizeWhatsappPhone(recipient.phone);
  if (!phone) return { ok: false, status: 'failed', reason: 'invalid_phone' };

  let senderUserId: string | null = null;
  let chatInstanceId: string | null = null;
  const routed = await resolveWhatsAppRoutingForEventKey(
    params.pool,
    params.tenantId,
    'appointment.confirmation_request',
  );
  if (routed) {
    senderUserId = routed.sender_user_id;
    chatInstanceId = routed.chat_instance_id;
  } else {
    senderUserId = await resolveWhatsAppSenderUserIdForTenant(
      params.pool,
      params.tenantId,
      a.responsible_user_id ?? a.created_by ?? params.actorUserId,
    );
  }
  if (!senderUserId) return { ok: false, status: 'failed', reason: 'missing_whatsapp_sender' };

  const responsavel = await loadResponsibleLabel(params.pool, a.responsible_user_id);
  const meetLink = (a.google_meet_link ?? '').trim();
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  const result = await runTransactionalNotification({
    pool: params.pool,
    tenantId: params.tenantId,
    senderUserId,
    eventKey: 'appointment.confirmation_request',
    entityType: 'appointment',
    entityId: a.id,
    idempotencyKey: `appointment:${a.id}:confirmation_request:${stamp}`,
    recipientPhone: phone,
    recipientType: a.client_id ? 'client' : 'lead',
    mergeContext: {
      nome: recipient.nome,
      titulo: a.title,
      data: formatDatePt(a.starts_at),
      hora: formatTimePt(a.starts_at),
      responsavel,
      meet_link: meetLink,
      local: (a.location ?? '').trim(),
      confirmation_link: params.confirmationLink,
    },
    eventOccurredAt: new Date(),
    actor: { type: 'user', user_id: params.actorUserId },
    metadata: {
      engine: 'notifications_engine',
      module: 'agenda',
      appointment_id: a.id,
      kind: 'confirmation_request',
      whatsapp_routing_source: chatInstanceId ? 'explicit' : 'fallback',
      ...(chatInstanceId ? { whatsapp_routed_chat_instance_id: chatInstanceId } : {}),
    },
    chatInstanceId,
  });
  if (!result.ok) {
    return {
      ok: false,
      status: 'failed',
      reason: 'whatsapp_dispatch_failed',
      error: result.error,
      delivery_id: null,
    };
  }
  if (isSkippedByTenantPreference(result)) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'notification_disabled_by_tenant',
      delivery_id: result.deliveryId,
    };
  }
  return { ok: true, status: 'sent', delivery_id: result.deliveryId };
}
