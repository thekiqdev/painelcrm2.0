/**
 * OS-S6 / OS-S9 — Visita técnica a partir da OS (marcar + remarcar).
 */
import { pool } from '../utils/db.js';
import {
  createAppointment,
  getAppointmentById,
  updateAppointment,
  type AppointmentRow,
} from './appointmentsService.js';
import {
  ServiceOrderDomainError,
  getServiceOrderById,
  insertServiceOrderEvent,
} from './serviceOrdersService.js';

function formatExecutionAddress(addr: Record<string, unknown> | null | undefined): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const parts = [addr.line, addr.city_uf, addr.postal_code].map((v) => String(v ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export type ScheduleServiceOrderVisitInput = {
  title?: string | null;
  description?: string | null;
  type?: string | null;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  responsible_user_id?: string | null;
  create_google_event?: boolean;
  create_meet?: boolean;
  send_reminder_to_client?: boolean;
};

export type ScheduleServiceOrderVisitResult = {
  appointment: AppointmentRow;
  warnings: string[];
  order: NonNullable<Awaited<ReturnType<typeof getServiceOrderById>>>;
};

export async function scheduleServiceOrderVisit(params: {
  tenantId: string;
  userId: string;
  serviceOrderId: string;
  input: ScheduleServiceOrderVisitInput;
}): Promise<ScheduleServiceOrderVisitResult> {
  const order = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!order) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  if (order.status === 'cancelled') {
    throw new ServiceOrderDomainError('OS cancelada não pode receber visita.', 409, 'cancelled');
  }
  if (order.appointment_id) {
    throw new ServiceOrderDomainError(
      'Esta OS já possui visita principal marcada. Abra a Agenda para reagendar.',
      409,
      'visit_already_scheduled',
    );
  }

  const starts = new Date(params.input.starts_at);
  const ends = new Date(params.input.ends_at);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
    throw new ServiceOrderDomainError('Intervalo de data/hora inválido.', 400, 'invalid_interval');
  }

  const type = String(params.input.type || 'visit').trim() || 'visit';
  const title =
    String(params.input.title || '').trim() ||
    `Visita técnica — OS Nº ${order.service_order_number}`;
  const location =
    String(params.input.location || '').trim() ||
    formatExecutionAddress(order.execution_address as Record<string, unknown>) ||
    null;
  const description =
    String(params.input.description || '').trim() ||
    `Visita técnica vinculada à Ordem de Serviço Nº ${order.service_order_number}.`;
  const responsible =
    params.input.responsible_user_id !== undefined
      ? params.input.responsible_user_id
      : order.responsible_user_id;

  const created = await createAppointment(params.tenantId, params.userId, {
    title,
    description,
    type,
    client_id: order.client_id ?? null,
    lead_id: null,
    responsible_user_id: responsible ?? null,
    starts_at: params.input.starts_at,
    ends_at: params.input.ends_at,
    location,
    create_google_event: params.input.create_google_event === true,
    create_meet: params.input.create_meet === true,
    send_reminder_to_client: params.input.send_reminder_to_client === true,
  });

  const appointmentId = created.primary.id;

  await pool.query(
    `UPDATE public.appointments
     SET service_order_id = $1
     WHERE id = $2 AND tenant_id = $3`,
    [params.serviceOrderId, appointmentId, params.tenantId],
  );

  const promoteScheduled = order.status === 'draft';
  await pool.query(
    `UPDATE public.service_orders
     SET appointment_id = $1,
         status = CASE WHEN $4::boolean AND status = 'draft' THEN 'scheduled' ELSE status END,
         updated_at = now()
     WHERE id = $2 AND tenant_id = $3 AND appointment_id IS NULL`,
    [appointmentId, params.serviceOrderId, params.tenantId, promoteScheduled],
  );

  const client = await pool.connect();
  try {
    await insertServiceOrderEvent(client, {
      tenantId: params.tenantId,
      serviceOrderId: params.serviceOrderId,
      eventType: 'visit_scheduled',
      payload: {
        appointment_id: appointmentId,
        create_google_event: params.input.create_google_event === true,
        sync_status: created.primary.sync_status,
      },
      createdBy: params.userId,
    });
  } finally {
    client.release();
  }

  const appointment =
    (await getAppointmentById(params.tenantId, appointmentId, params.userId, { can_view: true })) ||
    created.primary;

  const full = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!full) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }

  return {
    appointment,
    warnings: created.warnings,
    order: full,
  };
}

export type RescheduleServiceOrderVisitInput = {
  title?: string | null;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  responsible_user_id?: string | null;
  create_google_event?: boolean;
  create_meet?: boolean;
  send_reminder_to_client?: boolean;
};

export type RescheduleServiceOrderVisitResult = ScheduleServiceOrderVisitResult;

/** OS-S9 — Remarca a visita principal já vinculada à OS. */
export async function rescheduleServiceOrderVisit(params: {
  tenantId: string;
  userId: string;
  serviceOrderId: string;
  input: RescheduleServiceOrderVisitInput;
}): Promise<RescheduleServiceOrderVisitResult> {
  const order = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!order) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  if (order.status === 'cancelled') {
    throw new ServiceOrderDomainError('OS cancelada não pode remarcar visita.', 409, 'cancelled');
  }
  if (!order.appointment_id) {
    throw new ServiceOrderDomainError(
      'Esta OS ainda não possui visita marcada. Use marcar visita.',
      409,
      'visit_not_scheduled',
    );
  }

  const starts = new Date(params.input.starts_at);
  const ends = new Date(params.input.ends_at);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
    throw new ServiceOrderDomainError('Intervalo de data/hora inválido.', 400, 'invalid_interval');
  }

  const current = await getAppointmentById(
    params.tenantId,
    order.appointment_id,
    params.userId,
    { can_view: true },
  );
  if (!current) {
    throw new ServiceOrderDomainError('Compromisso vinculado não encontrado.', 404, 'appointment_not_found');
  }
  if (current.status === 'cancelled') {
    throw new ServiceOrderDomainError(
      'O compromisso vinculado está cancelado. Marque uma nova visita pela Agenda.',
      409,
      'appointment_cancelled',
    );
  }

  const title =
    params.input.title !== undefined && params.input.title !== null
      ? String(params.input.title).trim() || current.title
      : current.title;

  const patch: Parameters<typeof updateAppointment>[3] = {
    title,
    starts_at: params.input.starts_at,
    ends_at: params.input.ends_at,
  };
  if (params.input.location !== undefined) {
    patch.location =
      params.input.location === null
        ? null
        : String(params.input.location).trim() || null;
  }
  if (params.input.responsible_user_id !== undefined) {
    patch.responsible_user_id = params.input.responsible_user_id;
  }
  if (params.input.create_google_event !== undefined) {
    patch.create_google_event = params.input.create_google_event === true;
  }
  if (params.input.create_meet !== undefined) {
    patch.create_meet = params.input.create_meet === true;
  }
  if (params.input.send_reminder_to_client !== undefined) {
    patch.send_reminder_to_client = params.input.send_reminder_to_client === true;
  }

  const updated = await updateAppointment(
    params.tenantId,
    params.userId,
    order.appointment_id,
    patch,
  );
  if (!updated) {
    throw new ServiceOrderDomainError('Falha ao remarcar visita.', 500, 'reschedule_failed');
  }

  const warnings: string[] = [];
  if (updated.sync_status === 'error' && updated.sync_error) {
    warnings.push(updated.sync_error);
  }

  const client = await pool.connect();
  try {
    await insertServiceOrderEvent(client, {
      tenantId: params.tenantId,
      serviceOrderId: params.serviceOrderId,
      eventType: 'visit_rescheduled',
      payload: {
        appointment_id: order.appointment_id,
        starts_at: params.input.starts_at,
        ends_at: params.input.ends_at,
        create_google_event: params.input.create_google_event === true,
        sync_status: updated.sync_status,
      },
      createdBy: params.userId,
    });
  } finally {
    client.release();
  }

  const full = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!full) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }

  return {
    appointment: updated,
    warnings,
    order: full,
  };
}

export type ServiceOrderAppointmentSummary = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  sync_status: string;
  sync_error: string | null;
  google_html_link: string | null;
  google_meet_link: string | null;
  type: string;
  location: string | null;
};

export async function getServiceOrderAppointmentSummary(
  tenantId: string,
  appointmentId: string | null | undefined,
): Promise<ServiceOrderAppointmentSummary | null> {
  if (!appointmentId) return null;
  const r = await pool.query<ServiceOrderAppointmentSummary>(
    `SELECT id, title, starts_at, ends_at, status, sync_status, sync_error,
            google_html_link, google_meet_link, type, location
     FROM public.appointments
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [appointmentId, tenantId],
  );
  return r.rows[0] ?? null;
}
