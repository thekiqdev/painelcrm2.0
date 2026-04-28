import crypto from 'crypto';
import { pool } from '../utils/db.js';
import { createClientTimelineEvent } from './clientTimelineEventsService.js';
import { createNotification } from './notifications.js';
import { handlePublicConfirmationAutomation } from './appointmentAutomationService.js';
import {
  loadConnectionForUser,
  updateCalendarEvent,
  type GoogleCalendarReminder,
} from './googleCalendarService.js';
import { validatePublicRescheduleAgainstAvailability } from './appointmentAvailabilityService.js';

export type PublicConfirmationResponse = 'confirmed' | 'needs_reschedule' | 'declined';

type AppointmentPublicRow = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  lead_id: string | null;
  responsible_user_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  status: string;
  google_meet_link: string | null;
  google_html_link: string | null;
  google_event_id: string | null;
  create_google_event: boolean;
  reminders_json: unknown | null;
  recurrence_series_id: string | null;
  attendance_status: 'pending' | 'confirmed' | 'not_confirmed' | 'no_show' | null;
  attendance_note: string | null;
  responsible_name: string | null;
  company_name: string | null;
  public_confirmation_token: string | null;
  public_confirmation_token_expires_at: string | null;
  public_confirmation_responded_at: string | null;
  public_confirmation_response: PublicConfirmationResponse | null;
  client_name: string | null;
  lead_name: string | null;
};

export type PublicAppointmentConflictRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
};

export type SubmitPublicConfirmationResult =
  | { status: 'updated'; rescheduled?: boolean; has_conflict?: boolean; conflicts?: PublicAppointmentConflictRow[] }
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'already_responded' }
  | { status: 'validation_error'; message: string }
  | { status: 'invalid_state'; message: string };

const MAX_PUBLIC_RESCHEDULE_DURATION_MS = 8 * 60 * 60 * 1000;
const PAST_SKEW_MS = 60_000;

function sanitizeSyncError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const s = m.replace(/Bearer\s+\S+/gi, '[redacted]').replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted]');
  return s.length > 500 ? `${s.slice(0, 497)}...` : s;
}

function remindersFromJson(v: unknown): GoogleCalendarReminder[] | null | undefined {
  if (v == null) return null;
  if (Array.isArray(v)) {
    return v
      .map((r) => {
        const o = r as { method?: string; minutes?: number };
        if (o && (o.method === 'email' || o.method === 'popup') && typeof o.minutes === 'number') {
          return { method: o.method, minutes: o.minutes } as GoogleCalendarReminder;
        }
        return null;
      })
      .filter(Boolean) as GoogleCalendarReminder[];
  }
  return undefined;
}

async function listConflictsForResponsible(params: {
  tenantId: string;
  responsibleUserId: string | null;
  startsAt: string;
  endsAt: string;
  excludeAppointmentId: string;
}): Promise<PublicAppointmentConflictRow[]> {
  if (!params.responsibleUserId) return [];
  const args: unknown[] = [
    params.tenantId,
    params.responsibleUserId,
    params.endsAt,
    params.startsAt,
    params.excludeAppointmentId,
  ];
  const r = await pool.query<PublicAppointmentConflictRow>(
    `SELECT a.id, a.title, a.starts_at, a.ends_at
     FROM public.appointments a
     WHERE a.tenant_id = $1
       AND a.responsible_user_id = $2
       AND a.status <> 'cancelled'
       AND a.starts_at < $3::timestamptz
       AND a.ends_at > $4::timestamptz
       AND a.id <> $5
     ORDER BY a.starts_at ASC, a.id ASC
     LIMIT 20`,
    args,
  );
  return r.rows;
}

async function listAttendeeEmailsForGoogle(appointmentId: string): Promise<{ email: string }[]> {
  const a = await pool.query<{ email: string | null }>(
    `SELECT email FROM public.appointment_attendees WHERE appointment_id = $1`,
    [appointmentId],
  );
  return a.rows
    .filter((x) => x.email && String(x.email).includes('@'))
    .map((x) => ({ email: String(x.email) }));
}

async function syncGoogleAfterPublicTimeChange(params: {
  tenantId: string;
  oauthUserId: string;
  appointmentId: string;
}): Promise<void> {
  const rowR = await pool.query<AppointmentPublicRow>(
    `SELECT
       id,
       tenant_id,
       title,
       description,
       starts_at,
       ends_at,
       location,
       google_event_id,
       create_google_event,
       reminders_json,
       google_meet_link,
       google_html_link
     FROM public.appointments
     WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.appointmentId],
  );
  const row = rowR.rows[0];
  if (!row?.google_event_id || !row.create_google_event) return;

  const conn = await loadConnectionForUser(params.tenantId, params.oauthUserId);
  if (!conn) {
    await pool.query(
      `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
      [params.appointmentId, 'Conta Google não conectada nas configurações.', params.tenantId],
    );
    return;
  }

  try {
    const gAtt = await listAttendeeEmailsForGoogle(params.appointmentId);
    const rem = remindersFromJson(row.reminders_json) ?? null;
    const g = await updateCalendarEvent(conn, row.google_event_id, {
      title: row.title,
      description: [row.description, row.location ? `Local: ${row.location}` : ''].filter(Boolean).join('\n\n'),
      start: row.starts_at,
      end: row.ends_at,
      attendees: gAtt.length ? gAtt : undefined,
      createMeet: false,
      reminders: rem,
    });
    await pool.query(
      `UPDATE public.appointments
       SET google_meet_link = $2,
           google_html_link = $3,
           sync_status = 'synced',
           sync_error = NULL,
           google_calendar_connection_id = $4
       WHERE id = $1 AND tenant_id = $5`,
      [params.appointmentId, g.hangoutLink ?? row.google_meet_link, g.htmlLink ?? row.google_html_link, conn.id, params.tenantId],
    );
  } catch (e) {
    const err = sanitizeSyncError(e);
    await pool.query(
      `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
      [params.appointmentId, err, params.tenantId],
    );
  }
}

export function generatePublicConfirmationToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function buildPublicConfirmationLink(token: string): string {
  const raw = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '').split(',')[0]?.trim() ?? '';
  const base = raw.replace(/\/$/, '');
  const path = `/confirmar-compromisso/${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

export function computePublicConfirmationExpirationIso(endsAtIso: string): string {
  const base = new Date(endsAtIso);
  if (Number.isNaN(base.getTime())) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export async function ensureAppointmentPublicConfirmationToken(params: {
  tenantId: string;
  appointmentId: string;
  appointmentEndsAt: string;
  currentToken?: string | null;
  currentExpiresAt?: string | null;
}): Promise<{ token: string; expiresAt: string; confirmationLink: string }> {
  const now = new Date();
  const expiresAt = params.currentExpiresAt ? new Date(params.currentExpiresAt) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
  const shouldGenerate = !params.currentToken || expired;

  let token = params.currentToken ?? '';
  let nextExpiresAtIso = params.currentExpiresAt ?? '';
  if (shouldGenerate) {
    token = generatePublicConfirmationToken();
    nextExpiresAtIso = computePublicConfirmationExpirationIso(params.appointmentEndsAt);
    await pool.query(
      `UPDATE public.appointments
       SET public_confirmation_token = $3,
           public_confirmation_token_expires_at = $4::timestamptz,
           public_confirmation_responded_at = NULL,
           public_confirmation_response = NULL,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [params.tenantId, params.appointmentId, token, nextExpiresAtIso],
    );
  }

  return {
    token,
    expiresAt: nextExpiresAtIso,
    confirmationLink: buildPublicConfirmationLink(token),
  };
}

const appointmentPublicSelect = `
       a.id,
       a.tenant_id,
       a.client_id,
       a.lead_id,
       a.responsible_user_id,
       a.created_by,
       a.title,
       a.description,
       a.starts_at,
       a.ends_at,
       a.location,
       a.status,
       a.google_meet_link,
       a.google_html_link,
       a.google_event_id,
       a.create_google_event,
       a.reminders_json,
       a.recurrence_series_id,
       a.attendance_status,
       a.attendance_note,
       a.public_confirmation_token,
       a.public_confirmation_token_expires_at,
       a.public_confirmation_responded_at,
       a.public_confirmation_response,
       c.name AS client_name,
       l.name AS lead_name,
       ur.email AS responsible_name,
       t.name AS company_name`;

async function getAppointmentByPublicToken(token: string): Promise<AppointmentPublicRow | null> {
  const result = await pool.query<AppointmentPublicRow>(
    `SELECT ${appointmentPublicSelect}
     FROM public.appointments a
     LEFT JOIN public.clients c ON c.id = a.client_id
     LEFT JOIN public.leads l ON l.id = a.lead_id
     LEFT JOIN public.users ur ON ur.id = a.responsible_user_id
     LEFT JOIN public.tenants t ON t.id = a.tenant_id
     WHERE a.public_confirmation_token = $1
     LIMIT 1`,
    [token],
  );
  return result.rows[0] ?? null;
}

export async function getPublicConfirmationViewByToken(token: string): Promise<{
  appointment: {
    title: string;
    starts_at: string;
    ends_at: string;
    responsible_name: string;
    company_name: string;
    meet_link: string | null;
    location: string | null;
    attendance_status: string;
    is_recurring_occurrence: boolean;
  };
  expired: boolean;
  already_responded: boolean;
} | null> {
  const row = await getAppointmentByPublicToken(token);
  if (!row) return null;

  const now = Date.now();
  const exp = row.public_confirmation_token_expires_at
    ? new Date(row.public_confirmation_token_expires_at).getTime()
    : 0;
  const expired = exp <= now;
  const alreadyResponded = Boolean(row.public_confirmation_responded_at || row.public_confirmation_response);

  return {
    appointment: {
      title: row.title,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      responsible_name: row.responsible_name?.trim() || 'Responsável',
      company_name: row.company_name?.trim() || 'Empresa',
      meet_link: row.google_meet_link ?? null,
      location: row.location ?? null,
      attendance_status: row.attendance_status ?? 'pending',
      is_recurring_occurrence: Boolean(row.recurrence_series_id),
    },
    expired,
    already_responded: alreadyResponded,
  };
}

export function validatePublicRescheduleWindow(startsAtIso: string, endsAtIso: string): { ok: true } | { ok: false; message: string } {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: 'Data ou horário inválidos.' };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, message: 'O horário final deve ser depois do início.' };
  }
  if (end.getTime() - start.getTime() > MAX_PUBLIC_RESCHEDULE_DURATION_MS) {
    return { ok: false, message: 'A duração não pode exceder 8 horas.' };
  }
  if (start.getTime() < Date.now() - PAST_SKEW_MS) {
    return { ok: false, message: 'Escolha uma data e horário no futuro.' };
  }
  return { ok: true };
}

export async function getPublicRescheduleConflictPreview(params: {
  token: string;
  starts_at: string;
  ends_at: string;
}): Promise<
  | { ok: true; has_conflict: boolean; conflicts: PublicAppointmentConflictRow[] }
  | { ok: false; code: string; message?: string }
> {
  const win = validatePublicRescheduleWindow(params.starts_at, params.ends_at);
  if (!win.ok) return { ok: false, code: 'validation_error', message: win.message };

  const row = await getAppointmentByPublicToken(params.token);
  if (!row) return { ok: false, code: 'not_found' };
  if (row.public_confirmation_responded_at || row.public_confirmation_response) {
    return { ok: false, code: 'already_responded' };
  }
  const expiresAtMs = row.public_confirmation_token_expires_at
    ? new Date(row.public_confirmation_token_expires_at).getTime()
    : 0;
  if (expiresAtMs <= Date.now()) return { ok: false, code: 'expired' };
  if (row.status !== 'scheduled') return { ok: false, code: 'invalid_state', message: 'Compromisso não está agendado.' };

  const avail = await validatePublicRescheduleAgainstAvailability({
    tenantId: row.tenant_id,
    responsibleUserId: row.responsible_user_id,
    excludeAppointmentId: row.id,
    startsAtIso: params.starts_at,
    endsAtIso: params.ends_at,
  });
  if (!avail.ok) return { ok: false, code: 'validation_error', message: avail.message };

  const conflicts = await listConflictsForResponsible({
    tenantId: row.tenant_id,
    responsibleUserId: row.responsible_user_id,
    startsAt: params.starts_at,
    endsAt: params.ends_at,
    excludeAppointmentId: row.id,
  });
  return { ok: true, has_conflict: conflicts.length > 0, conflicts };
}

export async function submitPublicConfirmationByToken(params: {
  token: string;
  response: PublicConfirmationResponse;
  note?: string | null;
  starts_at?: string;
  ends_at?: string;
}): Promise<SubmitPublicConfirmationResult> {
  if (params.response === 'needs_reschedule') {
    if (!params.starts_at?.trim() || !params.ends_at?.trim()) {
      return { status: 'validation_error', message: 'Informe data e horário de início e fim para remarcar.' };
    }
    const win = validatePublicRescheduleWindow(params.starts_at, params.ends_at);
    if (!win.ok) return { status: 'validation_error', message: win.message };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const lock = await client.query<AppointmentPublicRow>(
      `SELECT ${appointmentPublicSelect}
       FROM public.appointments a
       LEFT JOIN public.clients c ON c.id = a.client_id
       LEFT JOIN public.leads l ON l.id = a.lead_id
       LEFT JOIN public.users ur ON ur.id = a.responsible_user_id
       LEFT JOIN public.tenants t ON t.id = a.tenant_id
       WHERE a.public_confirmation_token = $1
       LIMIT 1
       FOR UPDATE OF a`,
      [params.token],
    );
    const locked = lock.rows[0];
    if (!locked) {
      await client.query('ROLLBACK');
      return { status: 'not_found' };
    }
    const row = locked;

    if (row.public_confirmation_responded_at || row.public_confirmation_response) {
      await client.query('ROLLBACK');
      return { status: 'already_responded' };
    }
    const expiresAtMs = row.public_confirmation_token_expires_at
      ? new Date(row.public_confirmation_token_expires_at).getTime()
      : 0;
    if (expiresAtMs <= Date.now()) {
      await client.query('ROLLBACK');
      return { status: 'expired' };
    }

    if (row.status !== 'scheduled') {
      await client.query('ROLLBACK');
      return { status: 'invalid_state', message: 'Este compromisso não está agendado.' };
    }

    const note = params.note?.trim() || null;

    if (params.response === 'needs_reschedule' && params.starts_at && params.ends_at) {
      const avail = await validatePublicRescheduleAgainstAvailability({
        tenantId: row.tenant_id,
        responsibleUserId: row.responsible_user_id,
        excludeAppointmentId: row.id,
        startsAtIso: params.starts_at,
        endsAtIso: params.ends_at,
      });
      if (!avail.ok) {
        await client.query('ROLLBACK');
        return { status: 'validation_error', message: avail.message };
      }

      const conflicts = await listConflictsForResponsible({
        tenantId: row.tenant_id,
        responsibleUserId: row.responsible_user_id,
        startsAt: params.starts_at,
        endsAt: params.ends_at,
        excludeAppointmentId: row.id,
      });

      const oldStartsAt = row.starts_at;
      const oldEndsAt = row.ends_at;

      await client.query(
        `UPDATE public.appointments
         SET starts_at = $2::timestamptz,
             ends_at = $3::timestamptz,
             attendance_status = 'confirmed',
             attendance_confirmed_at = now(),
             attendance_updated_at = now(),
             attendance_note = $4,
             public_confirmation_responded_at = now(),
             public_confirmation_response = 'confirmed',
             updated_at = now()
         WHERE id = $1`,
        [row.id, params.starts_at, params.ends_at, note],
      );

      if (row.client_id) {
        await createClientTimelineEvent({
          tenantId: row.tenant_id,
          clientId: row.client_id,
          eventName: 'agenda_public_rescheduled',
          source: 'public_link',
          actorType: 'system',
          actorId: null,
          referenceType: 'appointment',
          referenceId: row.id,
          eventKey: `agenda:appointment:${row.id}:public-reschedule:${Date.now()}`,
          metadata: {
            old_starts_at: oldStartsAt,
            old_ends_at: oldEndsAt,
            new_starts_at: params.starts_at,
            new_ends_at: params.ends_at,
            note,
            origin: 'public_link',
            appointment_id: row.id,
            recurrence_series_id: row.recurrence_series_id,
          },
        });
      }

      await client.query('COMMIT');

      const oauthUserId = row.responsible_user_id ?? row.created_by;
      if (oauthUserId) {
        void syncGoogleAfterPublicTimeChange({
          tenantId: row.tenant_id,
          oauthUserId,
          appointmentId: row.id,
        }).catch((err) => console.error('[public-confirmation] google sync failed:', err));
      } else if (row.google_event_id) {
        await pool.query(
          `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
          [row.id, 'Sem responsável ou criador associado ao calendário.', row.tenant_id],
        );
      }

      if (row.responsible_user_id) {
        const recipient = row.client_name?.trim() || row.lead_name?.trim() || 'Cliente';
        await createNotification({
          userId: row.responsible_user_id,
          type: 'agenda_public_reschedule_done',
          title: 'Cliente remarcou o compromisso',
          message: `${recipient} escolheu um novo horário para "${row.title}".`,
          data: {
            appointment_id: row.id,
            href: `/agenda?appointment_id=${encodeURIComponent(row.id)}`,
          },
        });
      }

      return {
        status: 'updated',
        rescheduled: true,
        has_conflict: conflicts.length > 0,
        conflicts,
      };
    }

    const isConfirmed = params.response === 'confirmed';
    const attendanceStatus = isConfirmed ? 'confirmed' : 'not_confirmed';
    await client.query(
      `UPDATE public.appointments
       SET attendance_status = $2,
           attendance_confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() ELSE NULL END,
           attendance_updated_at = now(),
           attendance_note = CASE WHEN $2 = 'confirmed' THEN attendance_note ELSE COALESCE($3, attendance_note) END,
           public_confirmation_responded_at = now(),
           public_confirmation_response = $4,
           updated_at = now()
       WHERE id = $1`,
      [row.id, attendanceStatus, note, params.response],
    );

    if (row.client_id) {
      const eventName =
        params.response === 'confirmed'
          ? 'agenda_public_confirmation_confirmed'
          : 'agenda_public_confirmation_declined';
      await createClientTimelineEvent({
        tenantId: row.tenant_id,
        clientId: row.client_id,
        eventName,
        source: 'public_link',
        actorType: 'system',
        actorId: null,
        referenceType: 'appointment',
        referenceId: row.id,
        eventKey: `agenda:appointment:${row.id}:public-confirmation:${params.response}`,
        metadata: {
          response: params.response,
          note,
          responded_at: new Date().toISOString(),
          origin: 'public_link',
          appointment_id: row.id,
          starts_at: row.starts_at,
        },
      });
    }

    await client.query('COMMIT');
    void handlePublicConfirmationAutomation({
      appointmentId: row.id,
      response: params.response,
    }).catch((err) => {
      console.error('[appointment-automation] public confirmation automation failed:', err);
    });
    return { status: 'updated', rescheduled: false, has_conflict: false, conflicts: [] };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // noop
    }
    throw e;
  } finally {
    client.release();
  }
}
