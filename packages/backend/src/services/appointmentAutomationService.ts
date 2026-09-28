import { pool } from '../utils/db.js';
import { createNotification } from './notifications.js';

type AutomationKey =
  | 'needs_reschedule_task_created'
  | 'declined_task_created'
  | 'pending_confirmation_alert_24h';

type AppointmentAutomationRow = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  lead_id: string | null;
  responsible_user_id: string | null;
  title: string;
  starts_at: string;
  attendance_note: string | null;
  public_confirmation_response: 'confirmed' | 'needs_reschedule' | 'declined' | null;
  client_name: string | null;
  lead_name: string | null;
  responsible_name: string | null;
};

function formatDatePt(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}

function formatTimePt(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(iso));
}

async function getAppointmentForAutomation(appointmentId: string): Promise<AppointmentAutomationRow | null> {
  const r = await pool.query<AppointmentAutomationRow>(
    `SELECT
       a.id,
       a.tenant_id,
       a.client_id,
       a.lead_id,
       a.responsible_user_id,
       a.title,
       a.starts_at,
       a.attendance_note,
       a.public_confirmation_response,
       c.name AS client_name,
       l.name AS lead_name,
       ur.email AS responsible_name
     FROM public.appointments a
     LEFT JOIN public.clients c ON c.id = a.client_id
     LEFT JOIN public.leads l ON l.id = a.lead_id
     LEFT JOIN public.users ur ON ur.id = a.responsible_user_id
     WHERE a.id = $1
     LIMIT 1`,
    [appointmentId],
  );
  return r.rows[0] ?? null;
}

async function insertAutomationLogOnce(appointmentId: string, automationKey: AutomationKey): Promise<boolean> {
  const ins = await pool.query(
    `INSERT INTO public.appointment_automation_logs (appointment_id, automation_key, result, metadata_json)
     VALUES ($1, $2, 'processing', '{}'::jsonb)
     ON CONFLICT (appointment_id, automation_key) DO NOTHING`,
    [appointmentId, automationKey],
  );
  return (ins.rowCount ?? 0) > 0;
}

async function updateAutomationLog(
  appointmentId: string,
  automationKey: AutomationKey,
  result: 'created' | 'failed' | 'skipped',
  metadata: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `UPDATE public.appointment_automation_logs
     SET result = $3,
         metadata_json = $4::jsonb
     WHERE appointment_id = $1
       AND automation_key = $2`,
    [appointmentId, automationKey, result, JSON.stringify(metadata)],
  );
}

async function createTaskForAppointment(params: {
  appointment: AppointmentAutomationRow;
  title: string;
  description: string;
}): Promise<{ task_id: string; task_storage: 'client_tasks' | 'lead_tasks' | 'tasks'; task_href: string }> {
  const a = params.appointment;
  if (!a.responsible_user_id) {
    throw new Error('missing_responsible_user');
  }

  if (a.client_id) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.client_tasks (user_id, client_id, title, description, status, due_date)
       VALUES ($1, $2, $3, $4, 'Pendente', now())
       RETURNING id`,
      [a.responsible_user_id, a.client_id, params.title, params.description],
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error('failed_to_create_client_task');
    return { task_id: id, task_storage: 'client_tasks', task_href: `/clients/${encodeURIComponent(a.client_id)}?tab=tasks` };
  }

  if (a.lead_id) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.lead_tasks (user_id, lead_id, title, description, status, due_date)
       VALUES ($1, $2, $3, $4, 'Pendente', now())
       RETURNING id`,
      [a.responsible_user_id, a.lead_id, params.title, params.description],
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error('failed_to_create_lead_task');
    return { task_id: id, task_storage: 'lead_tasks', task_href: `/leads/${encodeURIComponent(a.lead_id)}?tab=tasks` };
  }

  const r = await pool.query<{ id: string }>(
    `INSERT INTO public.tasks (
       user_id, title, description, due_date, due_time, status, priority, client_name, assignee_id, assignee_name, checklist
     )
     VALUES ($1, $2, $3, CURRENT_DATE, NULL, 'pending', 'medium', $4, $1, $5, '[]'::jsonb)
     RETURNING id`,
    [
      a.responsible_user_id,
      params.title,
      params.description,
      a.client_name?.trim() || a.lead_name?.trim() || null,
      a.responsible_name?.trim() || null,
    ],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error('failed_to_create_general_task');
  return { task_id: id, task_storage: 'tasks', task_href: '/tasks' };
}

export async function handlePublicConfirmationAutomation(params: {
  appointmentId: string;
  response: 'needs_reschedule' | 'declined' | 'confirmed';
}): Promise<void> {
  if (params.response !== 'needs_reschedule' && params.response !== 'declined') return;
  const appointment = await getAppointmentForAutomation(params.appointmentId);
  if (!appointment || !appointment.responsible_user_id) return;

  const isNeeds = params.response === 'needs_reschedule';
  const key: AutomationKey = isNeeds ? 'needs_reschedule_task_created' : 'declined_task_created';
  const okToRun = await insertAutomationLogOnce(appointment.id, key);
  if (!okToRun) return;

  const recipient = appointment.client_name?.trim() || appointment.lead_name?.trim() || 'cliente';
  const title = isNeeds
    ? `Reagendar compromisso com ${recipient}`
    : `Avaliar próximo passo com ${recipient}`;
  const description = [
    isNeeds
      ? 'O cliente solicitou remarcação pelo link de confirmação.'
      : 'O cliente informou que não poderá comparecer ao compromisso.',
    '',
    `Compromisso: ${appointment.title}`,
    `Data original: ${formatDatePt(appointment.starts_at)} às ${formatTimePt(appointment.starts_at)}`,
    `Mensagem do cliente: ${appointment.attendance_note?.trim() || '-'}`,
  ].join('\n');

  try {
    const task = await createTaskForAppointment({ appointment, title, description });
    await updateAutomationLog(appointment.id, key, 'created', task);
  } catch (error) {
    await updateAutomationLog(appointment.id, key, 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runPendingConfirmationAutomationOnce(): Promise<{ checked: number; created: number }> {
  const rows = await pool.query<AppointmentAutomationRow>(
    `SELECT
       a.id,
       a.tenant_id,
       a.client_id,
       a.lead_id,
       a.responsible_user_id,
       a.title,
       a.starts_at,
       a.attendance_note,
       a.public_confirmation_response,
       c.name AS client_name,
       l.name AS lead_name,
       ur.email AS responsible_name
     FROM public.appointments a
     LEFT JOIN public.clients c ON c.id = a.client_id
     LEFT JOIN public.leads l ON l.id = a.lead_id
     LEFT JOIN public.users ur ON ur.id = a.responsible_user_id
     WHERE a.status = 'scheduled'
       AND COALESCE(a.attendance_status, 'pending') = 'pending'
       AND a.starts_at >= now()
       AND a.starts_at <= (now() + interval '24 hours')
       AND a.public_confirmation_response IS NULL
       AND a.public_confirmation_responded_at IS NULL
       AND a.responsible_user_id IS NOT NULL
     ORDER BY a.starts_at ASC`,
    [],
  );

  let created = 0;
  for (const row of rows.rows) {
    const key: AutomationKey = 'pending_confirmation_alert_24h';
    const okToRun = await insertAutomationLogOnce(row.id, key);
    if (!okToRun) continue;

    try {
      await createNotification({
        userId: row.responsible_user_id as string,
        type: 'agenda_pending_confirmation_alert',
        title: 'Compromisso ainda sem confirmação',
        message: `O compromisso "${row.title}" ainda está aguardando confirmação do cliente.`,
        data: {
          appointment_id: row.id,
          href: `/agenda?appointment_id=${encodeURIComponent(row.id)}`,
          starts_at: row.starts_at,
        },
      });
      await updateAutomationLog(row.id, key, 'created', {
        notified_user_id: row.responsible_user_id,
      });
      created += 1;
    } catch (error) {
      await updateAutomationLog(row.id, key, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { checked: rows.rowCount ?? 0, created };
}
