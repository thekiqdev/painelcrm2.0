import { pool } from '../utils/db.js';
import { loadTypeLabelsForTenant } from './appointmentTypeSettingsService.js';
import {
  createEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  loadConnectionForUser,
} from './googleCalendarService.js';
import { createClientTimelineEvent } from './clientTimelineEventsService.js';
import { getUserRoleInTenant, getEffectiveModulePermissions } from './modulePermissionsService.js';
import type { GoogleCalendarReminder } from './googleCalendarService.js';
import {
  publishAppointmentCompleted,
  publishAppointmentInvite,
  publishAppointmentConfirmationRequest,
} from './notificationsEngine/appointmentTransactionalNotifications.js';
import { ensureAppointmentPublicConfirmationToken } from './publicAppointmentConfirmationService.js';

export type AppointmentRow = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  lead_id: string | null;
  responsible_user_id: string | null;
  title: string;
  description: string | null;
  type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  create_google_event: boolean;
  google_calendar_connection_id: string | null;
  google_event_id: string | null;
  google_meet_link: string | null;
  google_html_link: string | null;
  sync_status: string;
  sync_error: string | null;
  reminders_json: unknown | null;
  send_reminder_to_client?: boolean;
  recurrence_series_id?: string | null;
  recurrence_occurrence_index?: number | null;
  recurrence_original_starts_at?: string | null;
  attendance_status?: 'pending' | 'confirmed' | 'not_confirmed' | 'no_show';
  attendance_confirmed_at?: string | null;
  attendance_updated_at?: string | null;
  attendance_note?: string | null;
  public_confirmation_token?: string | null;
  public_confirmation_token_expires_at?: string | null;
  public_confirmation_responded_at?: string | null;
  public_confirmation_response?: 'confirmed' | 'needs_reschedule' | 'declined' | null;
  needs_reschedule_task_created_at?: string | null;
  needs_reschedule_task_href?: string | null;
  declined_task_created_at?: string | null;
  declined_task_href?: string | null;
  completed_at?: string | null;
  completion_notes?: string | null;
  outcome?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  client_name?: string | null;
  lead_name?: string | null;
  responsible_name?: string | null;
  created_by_name?: string | null;
};

export type AppointmentRecurrenceInput = {
  frequency: 'none' | 'weekly' | 'monthly' | 'weekdays';
  interval?: number;
  weekdays?: number[];
  until?: string;
  max_occurrences?: number;
  send_invite_for_all_occurrences?: boolean;
};

export type RecurrenceSeriesPatchInput = Partial<{
  title: string;
  description: string | null;
  type: string;
  responsible_user_id: string | null;
  location: string | null;
  reminders: GoogleCalendarReminder[] | null;
  send_reminder_to_client: boolean;
}>;

export type AppointmentOutcome =
  | 'success'
  | 'no_show'
  | 'rescheduled'
  | 'needs_follow_up'
  | 'lost'
  | 'other';

export type AppointmentsReportSummary = {
  summary: {
    total: number;
    scheduled: number;
    done: number;
    cancelled: number;
    no_show: number;
    confirmed: number;
    not_confirmed: number;
    pending_confirmation: number;
    needs_reschedule: number;
    declined: number;
    follow_ups_created: number;
    completion_rate: number;
  };
  by_responsible: Array<{
    user_id: string | null;
    name: string;
    total: number;
    done: number;
    cancelled: number;
    no_show: number;
    completion_rate: number;
  }>;
  by_type: Array<{
    type: string;
    label: string;
    total: number;
    done: number;
  }>;
  by_outcome: Array<{
    outcome: string;
    label: string;
    total: number;
  }>;
};

export type AppointmentConflictRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
};

function sanitizeSyncError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const s = m.replace(/Bearer\s+\S+/gi, '[redacted]').replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted]');
  return s.length > 500 ? `${s.slice(0, 497)}...` : s;
}

export function listAppointmentsScopeForUser(
  userId: string,
  role: Awaited<ReturnType<typeof getUserRoleInTenant>>,
  agendaPerm: { edit_own_only?: boolean } | undefined,
): { ownOnly: boolean } {
  if (role === 'admin' || role === 'manager') {
    return { ownOnly: false };
  }
  if (agendaPerm?.edit_own_only === true) {
    return { ownOnly: true };
  }
  if (role === 'member' || role === 'viewer') {
    return { ownOnly: true };
  }
  return { ownOnly: false };
}

export async function listAppointments(params: {
  tenantId: string;
  userId: string;
  dateFrom?: string;
  dateTo?: string;
  responsibleUserId?: string;
  clientId?: string;
  leadId?: string;
  status?: string;
  type?: string;
  confirmationStatus?: 'pending' | 'confirmed' | 'not_confirmed' | 'needs_reschedule' | 'declined' | 'no_show';
  limit: number;
  offset: number;
}): Promise<{ items: AppointmentRow[]; total: number }> {
  const perms = await getEffectiveModulePermissions(params.userId);
  const p = perms['agenda'];
  if (p && p.can_view === false) {
    return { items: [], total: 0 };
  }
  const role = await getUserRoleInTenant(params.userId);
  const { ownOnly } = listAppointmentsScopeForUser(params.userId, role, p);

  const conds: string[] = ['a.tenant_id = $1'];
  const args: unknown[] = [params.tenantId];
  let n = 2;
  if (ownOnly) {
    conds.push(`(a.created_by = $${n} OR a.responsible_user_id = $${n})`);
    args.push(params.userId);
    n += 1;
  }
  if (params.dateFrom) {
    conds.push(`a.starts_at >= $${n}::timestamptz`);
    args.push(params.dateFrom);
    n += 1;
  }
  if (params.dateTo) {
    conds.push(`a.starts_at <= $${n}::timestamptz`);
    args.push(params.dateTo);
    n += 1;
  }
  if (params.responsibleUserId) {
    conds.push(`a.responsible_user_id = $${n}`);
    args.push(params.responsibleUserId);
    n += 1;
  }
  if (params.clientId) {
    conds.push(`a.client_id = $${n}`);
    args.push(params.clientId);
    n += 1;
  }
  if (params.leadId) {
    conds.push(`a.lead_id = $${n}`);
    args.push(params.leadId);
    n += 1;
  }
  if (params.status) {
    conds.push(`a.status = $${n}`);
    args.push(params.status);
    n += 1;
  }
  if (params.type) {
    conds.push(`a.type = $${n}`);
    args.push(params.type);
    n += 1;
  }
  if (params.confirmationStatus) {
    if (params.confirmationStatus === 'needs_reschedule') {
      conds.push(`a.public_confirmation_response = $${n}`);
      args.push('needs_reschedule');
      n += 1;
    } else if (params.confirmationStatus === 'declined') {
      conds.push(`a.public_confirmation_response = $${n}`);
      args.push('declined');
      n += 1;
    } else {
      conds.push(`a.attendance_status = $${n}`);
      args.push(params.confirmationStatus);
      n += 1;
    }
  }

  const where = `WHERE ${conds.join(' AND ')}`;
  const countQ = `SELECT count(*)::int AS c FROM public.appointments a ${where}`;
  const countR = await pool.query<{ c: number }>(countQ, args);
  const total = countR.rows[0]?.c ?? 0;

  const lim = n;
  const off = n + 1;
  const q = `
    SELECT ${appointmentListSelect}
    ${appointmentListJoins}
    ${where}
    ORDER BY a.starts_at ASC, a.id ASC
    LIMIT $${lim} OFFSET $${off}
  `;
  const listArgs = [...args, params.limit, params.offset];
  const r = await pool.query<AppointmentRow & Record<string, unknown>>(q, listArgs);
  return { items: r.rows as AppointmentRow[], total };
}

export async function getAppointmentsReportsSummary(params: {
  tenantId: string;
  userId: string;
  dateFrom?: string;
  dateTo?: string;
  responsibleUserId?: string;
  type?: string;
}): Promise<AppointmentsReportSummary> {
  const perms = await getEffectiveModulePermissions(params.userId);
  const p = perms['agenda'];
  if (p && p.can_view === false) {
    return {
      summary: {
        total: 0,
        scheduled: 0,
        done: 0,
        cancelled: 0,
        no_show: 0,
        confirmed: 0,
        not_confirmed: 0,
        pending_confirmation: 0,
        needs_reschedule: 0,
        declined: 0,
        follow_ups_created: 0,
        completion_rate: 0,
      },
      by_responsible: [],
      by_type: [],
      by_outcome: [],
    };
  }
  const role = await getUserRoleInTenant(params.userId);
  const { ownOnly } = listAppointmentsScopeForUser(params.userId, role, p);

  const conds: string[] = ['a.tenant_id = $1'];
  const args: unknown[] = [params.tenantId];
  let n = 2;

  if (ownOnly) {
    conds.push(`(a.created_by = $${n} OR a.responsible_user_id = $${n})`);
    args.push(params.userId);
    n += 1;
  } else if (params.responsibleUserId) {
    conds.push(`a.responsible_user_id = $${n}`);
    args.push(params.responsibleUserId);
    n += 1;
  }
  if (params.dateFrom) {
    conds.push(`a.starts_at >= $${n}::timestamptz`);
    args.push(params.dateFrom);
    n += 1;
  }
  if (params.dateTo) {
    conds.push(`a.starts_at <= $${n}::timestamptz`);
    args.push(params.dateTo);
    n += 1;
  }
  if (params.type) {
    conds.push(`a.type = $${n}`);
    args.push(params.type);
    n += 1;
  }
  const where = `WHERE ${conds.join(' AND ')}`;

  const summaryR = await pool.query<{
    total: number;
    scheduled: number;
    done: number;
    cancelled: number;
    no_show: number;
    confirmed: number;
    not_confirmed: number;
    pending_confirmation: number;
    needs_reschedule: number;
    declined: number;
    follow_ups_created: number;
  }>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE a.status = 'scheduled')::int AS scheduled,
       COUNT(*) FILTER (WHERE a.status = 'done')::int AS done,
       COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
       COUNT(*) FILTER (WHERE a.outcome = 'no_show')::int AS no_show,
       COUNT(*) FILTER (WHERE a.attendance_status = 'confirmed')::int AS confirmed,
       COUNT(*) FILTER (WHERE a.attendance_status = 'not_confirmed')::int AS not_confirmed,
       COUNT(*) FILTER (WHERE a.attendance_status = 'pending' OR a.attendance_status IS NULL)::int AS pending_confirmation,
       COUNT(*) FILTER (WHERE a.public_confirmation_response = 'needs_reschedule')::int AS needs_reschedule,
       COUNT(*) FILTER (WHERE a.public_confirmation_response = 'declined')::int AS declined,
       COUNT(*) FILTER (WHERE a.title ILIKE 'Follow-up:%')::int AS follow_ups_created
     FROM public.appointments a
     ${where}`,
    args,
  );
  const s = summaryR.rows[0] ?? {
    total: 0,
    scheduled: 0,
    done: 0,
    cancelled: 0,
    no_show: 0,
    confirmed: 0,
    not_confirmed: 0,
    pending_confirmation: 0,
    needs_reschedule: 0,
    declined: 0,
    follow_ups_created: 0,
  };
  const completionRate = s.total > 0 ? Number(((s.done / s.total) * 100).toFixed(1)) : 0;

  const byResponsible = await pool.query<{
    user_id: string | null;
    name: string;
    total: number;
    done: number;
    cancelled: number;
    no_show: number;
  }>(
    `SELECT
       a.responsible_user_id::text AS user_id,
       COALESCE(u.email, 'Sem responsável') AS name,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE a.status = 'done')::int AS done,
       COUNT(*) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
       COUNT(*) FILTER (WHERE a.outcome = 'no_show')::int AS no_show
     FROM public.appointments a
     LEFT JOIN public.users u ON u.id = a.responsible_user_id
     ${where}
     GROUP BY a.responsible_user_id, u.email
     ORDER BY total DESC, name ASC`,
    args,
  );

  const byType = await pool.query<{ type: string; total: number; done: number }>(
    `SELECT
       a.type,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE a.status = 'done')::int AS done
     FROM public.appointments a
     ${where}
     GROUP BY a.type
     ORDER BY total DESC, a.type ASC`,
    args,
  );

  const byOutcome = await pool.query<{ outcome: string; total: number }>(
    `SELECT
       a.outcome,
       COUNT(*)::int AS total
     FROM public.appointments a
     ${where}
       AND a.outcome IS NOT NULL
     GROUP BY a.outcome
     ORDER BY total DESC, a.outcome ASC`,
    args,
  );

  const typeLabel: Record<string, string> = {
    meeting: 'Reunião',
    call: 'Chamada',
    visit: 'Visita',
    other: 'Outro',
  };
  const customTypeLabels = await loadTypeLabelsForTenant(params.tenantId);
  const outcomeLabel: Record<string, string> = {
    success: 'Sucesso',
    no_show: 'Não compareceu',
    rescheduled: 'Remarcado',
    needs_follow_up: 'Precisa de follow-up',
    lost: 'Perdido',
    other: 'Outro',
  };

  return {
    summary: {
      total: s.total,
      scheduled: s.scheduled,
      done: s.done,
      cancelled: s.cancelled,
      no_show: s.no_show,
      confirmed: s.confirmed,
      not_confirmed: s.not_confirmed,
      pending_confirmation: s.pending_confirmation,
      needs_reschedule: s.needs_reschedule,
      declined: s.declined,
      follow_ups_created: s.follow_ups_created,
      completion_rate: completionRate,
    },
    by_responsible: byResponsible.rows.map((r) => ({
      user_id: r.user_id,
      name: r.name,
      total: r.total,
      done: r.done,
      cancelled: r.cancelled,
      no_show: r.no_show,
      completion_rate: r.total > 0 ? Number(((r.done / r.total) * 100).toFixed(1)) : 0,
    })),
    by_type: byType.rows.map((r) => ({
      type: r.type,
      label: customTypeLabels[r.type] ?? typeLabel[r.type] ?? r.type,
      total: r.total,
      done: r.done,
    })),
    by_outcome: byOutcome.rows.map((r) => ({
      outcome: r.outcome,
      label: outcomeLabel[r.outcome] ?? r.outcome,
      total: r.total,
    })),
  };
}

const appointmentListSelect = `
  a.*,
  c.name AS client_name,
  l.name AS lead_name,
  u_resp.email AS responsible_name,
  u_c.email AS created_by_name,
  auto_need.created_at AS needs_reschedule_task_created_at,
  (auto_need.metadata_json->>'task_href') AS needs_reschedule_task_href,
  auto_decl.created_at AS declined_task_created_at,
  (auto_decl.metadata_json->>'task_href') AS declined_task_href
`;

const appointmentListJoins = `
  FROM public.appointments a
  LEFT JOIN public.clients c ON c.id = a.client_id
  LEFT JOIN public.leads l ON l.id = a.lead_id
  LEFT JOIN public.users u_resp ON u_resp.id = a.responsible_user_id
  LEFT JOIN public.users u_c ON u_c.id = a.created_by
  LEFT JOIN public.appointment_automation_logs auto_need
    ON auto_need.appointment_id = a.id
   AND auto_need.automation_key = 'needs_reschedule_task_created'
   AND auto_need.result = 'created'
  LEFT JOIN public.appointment_automation_logs auto_decl
    ON auto_decl.appointment_id = a.id
   AND auto_decl.automation_key = 'declined_task_created'
   AND auto_decl.result = 'created'
`;

/**
 * Próximos (scheduled, futuros) e histórico (done/cancelled) para o perfil do cliente.
 * Verifica se o cliente pertence ao tenant. Respeita ownOnly da agenda.
 * Retorna null se o cliente não existir neste tenant.
 */
export async function listAppointmentsByClientForProfile(params: {
  tenantId: string;
  userId: string;
  clientId: string;
}): Promise<{ upcoming: AppointmentRow[]; history: AppointmentRow[] } | null> {
  const perms = await getEffectiveModulePermissions(params.userId);
  const p = perms['agenda'];
  const role = await getUserRoleInTenant(params.userId);
  const { ownOnly } = listAppointmentsScopeForUser(params.userId, role, p);

  const clientR = await pool.query(
    `SELECT 1
     FROM public.clients c
     INNER JOIN public.users u ON u.id = c.user_id AND u.tenant_id = $2
     WHERE c.id = $1`,
    [params.clientId, params.tenantId],
  );
  if (clientR.rowCount === 0) return null;

  const nowIso = new Date().toISOString();

  const condsBase: string[] = ['a.tenant_id = $1', 'a.client_id = $2'];
  const argsBase: unknown[] = [params.tenantId, params.clientId];
  let n = 3;
  if (ownOnly) {
    condsBase.push(`(a.created_by = $${n} OR a.responsible_user_id = $${n})`);
    argsBase.push(params.userId);
    n += 1;
  }

  const condsUp = [...condsBase, `a.status = 'scheduled'`, `a.starts_at >= $${n}::timestamptz`];
  const argsUp = [...argsBase, nowIso];
  const whereUp = `WHERE ${condsUp.join(' AND ')}`;
  const qUp = `
    SELECT ${appointmentListSelect}
    ${appointmentListJoins}
    ${whereUp}
    ORDER BY a.starts_at ASC, a.id ASC
    LIMIT 5
  `;
  const rUp = await pool.query<AppointmentRow & Record<string, unknown>>(qUp, argsUp);

  const condsHist = [...condsBase, `a.status IN ('done', 'cancelled')`];
  const whereHist = `WHERE ${condsHist.join(' AND ')}`;
  const qHist = `
    SELECT ${appointmentListSelect}
    ${appointmentListJoins}
    ${whereHist}
    ORDER BY a.starts_at DESC, a.id DESC
    LIMIT 5
  `;
  const rHist = await pool.query<AppointmentRow & Record<string, unknown>>(qHist, argsBase);

  return {
    upcoming: rUp.rows as AppointmentRow[],
    history: rHist.rows as AppointmentRow[],
  };
}

export async function getAppointmentById(
  tenantId: string,
  id: string,
  userId: string,
  agendaPerm: { can_view?: boolean; edit_own_only?: boolean } | undefined,
): Promise<AppointmentRow | null> {
  if (agendaPerm && agendaPerm.can_view === false) return null;
  const r = await pool.query<AppointmentRow & Record<string, unknown>>(
    `SELECT ${appointmentListSelect}
     ${appointmentListJoins}
     WHERE a.tenant_id = $1 AND a.id = $2`,
    [tenantId, id],
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0] as AppointmentRow;
  const role = await getUserRoleInTenant(userId);
  const { ownOnly } = listAppointmentsScopeForUser(userId, role, agendaPerm);
  if (ownOnly) {
    const ok = row.created_by === userId || row.responsible_user_id === userId;
    if (!ok) return null;
  }
  return row;
}

export async function getRepresentativeAppointmentBySeries(
  tenantId: string,
  seriesId: string,
): Promise<AppointmentRow | null> {
  const r = await pool.query<AppointmentRow>(
    `SELECT *
     FROM public.appointments
     WHERE tenant_id = $1 AND recurrence_series_id = $2
     ORDER BY recurrence_occurrence_index ASC NULLS LAST, starts_at ASC
     LIMIT 1`,
    [tenantId, seriesId],
  );
  return r.rows[0] ?? null;
}

export async function listAppointmentConflicts(params: {
  tenantId: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  responsibleUserId: string;
  excludeAppointmentId?: string;
}): Promise<AppointmentConflictRow[]> {
  const perms = await getEffectiveModulePermissions(params.userId);
  const p = perms['agenda'];
  if (p && p.can_view === false) {
    return [];
  }
  const role = await getUserRoleInTenant(params.userId);
  const { ownOnly } = listAppointmentsScopeForUser(params.userId, role, p);
  const targetResponsibleUserId = ownOnly ? params.userId : params.responsibleUserId;

  const args: unknown[] = [params.tenantId, targetResponsibleUserId, params.endsAt, params.startsAt];
  const conds: string[] = [
    'a.tenant_id = $1',
    'a.responsible_user_id = $2',
    "a.status <> 'cancelled'",
    'a.starts_at < $3::timestamptz',
    'a.ends_at > $4::timestamptz',
  ];

  if (params.excludeAppointmentId) {
    args.push(params.excludeAppointmentId);
    conds.push(`a.id <> $${args.length}`);
  }

  const r = await pool.query<AppointmentConflictRow>(
    `SELECT a.id, a.title, a.starts_at, a.ends_at
     FROM public.appointments a
     WHERE ${conds.join(' AND ')}
     ORDER BY a.starts_at ASC, a.id ASC
     LIMIT 20`,
    args,
  );
  return r.rows;
}

async function listAttendees(appointmentId: string) {
  const a = await pool.query(
    `SELECT id, name, email, phone, attendee_type, created_at
     FROM public.appointment_attendees WHERE appointment_id = $1 ORDER BY created_at ASC`,
    [appointmentId],
  );
  return a.rows;
}

type AttendeeIn = { name?: string | null; email?: string | null; phone?: string | null; attendee_type?: string };

function remindersFromJson(
  v: unknown,
): GoogleCalendarReminder[] | null | undefined {
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

type OccurrenceWindow = { startsAtIso: string; endsAtIso: string; index: number };

function addDaysUtc(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonthsUtc(base: Date, months: number): Date {
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function toIsoDateOnly(v: string | undefined): string | null {
  if (!v) return null;
  const t = String(v).trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function weekdayIso1to7(d: Date): number {
  const x = d.getUTCDay();
  return x === 0 ? 7 : x;
}

function buildRecurringOccurrences(params: {
  startsAtIso: string;
  endsAtIso: string;
  recurrence: AppointmentRecurrenceInput;
}): OccurrenceWindow[] {
  const start = new Date(params.startsAtIso);
  const end = new Date(params.endsAtIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }
  const durationMs = end.getTime() - start.getTime();
  const recurrence = params.recurrence;
  if (!recurrence || recurrence.frequency === 'none') {
    return [{ startsAtIso: start.toISOString(), endsAtIso: end.toISOString(), index: 1 }];
  }

  const limitAbs = 100;
  const defaultMax = 12;
  const maxOccurrences = Math.max(1, Math.min(limitAbs, recurrence.max_occurrences ?? defaultMax));
  const untilDateIso = toIsoDateOnly(recurrence.until);
  const untilDate = untilDateIso ? new Date(`${untilDateIso}T23:59:59.999Z`) : null;

  const out: OccurrenceWindow[] = [];
  const pushOccurrence = (occStart: Date) => {
    if (untilDate && occStart > untilDate) return false;
    const occEnd = new Date(occStart.getTime() + durationMs);
    out.push({ startsAtIso: occStart.toISOString(), endsAtIso: occEnd.toISOString(), index: out.length + 1 });
    return out.length < maxOccurrences;
  };

  if (recurrence.frequency === 'weekdays') {
    let cur = new Date(start);
    while (out.length < maxOccurrences) {
      const wd = weekdayIso1to7(cur);
      if (wd >= 1 && wd <= 5) {
        if (!pushOccurrence(cur)) break;
      }
      cur = addDaysUtc(cur, 1);
      if (untilDate && cur > untilDate) break;
    }
    return out;
  }

  if (recurrence.frequency === 'weekly') {
    const interval = Math.max(1, recurrence.interval ?? 1);
    const anchor = new Date(start);
    const weekdays = Array.from(
      new Set((recurrence.weekdays ?? [weekdayIso1to7(start)]).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)),
    ).sort((a, b) => a - b);
    let cur = new Date(anchor);
    while (out.length < maxOccurrences) {
      const diffDays = Math.floor((cur.getTime() - anchor.getTime()) / 86_400_000);
      const weekIndex = Math.floor(diffDays / 7);
      const inInterval = weekIndex % interval === 0;
      if (inInterval && weekdays.includes(weekdayIso1to7(cur)) && cur >= anchor) {
        if (!pushOccurrence(cur)) break;
      }
      cur = addDaysUtc(cur, 1);
      if (untilDate && cur > untilDate) break;
    }
    return out;
  }

  if (recurrence.frequency === 'monthly') {
    const interval = Math.max(1, recurrence.interval ?? 1);
    const wantedDay = Math.min(31, Math.max(1, start.getUTCDate()));
    let cur = new Date(start);
    while (out.length < maxOccurrences) {
      const monthStart = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
      const candidate = new Date(monthStart);
      const lastDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate();
      candidate.setUTCDate(Math.min(wantedDay, lastDay));
      if (candidate >= start) {
        if (!pushOccurrence(candidate)) break;
      }
      cur = addMonthsUtc(monthStart, interval);
      if (untilDate && cur > untilDate) break;
    }
    return out;
  }

  return [{ startsAtIso: start.toISOString(), endsAtIso: end.toISOString(), index: 1 }];
}

export async function createAppointment(
  tenantId: string,
  userId: string,
  data: {
    title: string;
    description?: string | null;
    type: string;
    client_id?: string | null;
    lead_id?: string | null;
    responsible_user_id?: string | null;
    starts_at: string;
    ends_at: string;
    location?: string | null;
    create_google_event: boolean;
    create_meet: boolean;
    attendees?: AttendeeIn[];
    reminders?: GoogleCalendarReminder[] | null;
    send_reminder_to_client?: boolean;
    recurrence?: AppointmentRecurrenceInput | null;
    /** Quando true, não grava `agenda_appointment_created` (ex.: origem chat com evento próprio). */
    skip_initial_client_timeline?: boolean;
  },
): Promise<{ primary: AppointmentRow; createdCount: number; warnings: string[] }> {
  if (data.client_id && data.lead_id) {
    throw new Error('Informe cliente ou lead, não ambos.');
  }
  let rems: GoogleCalendarReminder[] | null;
  if (data.reminders === undefined || data.reminders === null) {
    rems = [
      { method: 'popup', minutes: 10 },
      { method: 'popup', minutes: 60 },
    ];
  } else {
    rems = data.reminders;
  }
  const rRem = JSON.stringify(rems);
  const sendToClient = data.send_reminder_to_client === true;
  const warnings: string[] = [];
  const recurrence = data.recurrence;
  const isRecurring = recurrence && recurrence.frequency !== 'none';

  let recurrenceSeriesId: string | null = null;
  let plannedOccurrences: OccurrenceWindow[] = [{ startsAtIso: data.starts_at, endsAtIso: data.ends_at, index: 1 }];

  if (isRecurring) {
    plannedOccurrences = buildRecurringOccurrences({
      startsAtIso: data.starts_at,
      endsAtIso: data.ends_at,
      recurrence: recurrence!,
    });
    if (plannedOccurrences.length === 0) {
      throw new Error('Não foi possível gerar ocorrências da recorrência.');
    }
    const untilIso = toIsoDateOnly(recurrence?.until);
    const maxOccurrences = Math.max(1, Math.min(100, recurrence?.max_occurrences ?? 12));
    const dayOfMonth = new Date(data.starts_at).getUTCDate();
    const seriesIns = await pool.query<{ id: string }>(
      `INSERT INTO public.appointment_recurrence_series (
         tenant_id, created_by, title, description, type, responsible_user_id, client_id, lead_id, location,
         recurrence_frequency, recurrence_interval, weekdays_json, day_of_month, starts_at, ends_at,
         recurrence_until, max_occurrences, create_google_event, create_meet, send_reminder_to_client, reminders_json, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12::jsonb, $13, $14::timestamptz, $15::timestamptz,
         $16::date, $17, $18, $19, $20, $21::jsonb, 'active'
       )
       RETURNING id`,
      [
        tenantId,
        userId,
        data.title,
        data.description ?? null,
        data.type,
        data.responsible_user_id ?? null,
        data.client_id ?? null,
        data.lead_id ?? null,
        data.location ?? null,
        recurrence!.frequency,
        Math.max(1, recurrence!.interval ?? 1),
        JSON.stringify(recurrence!.weekdays ?? []),
        recurrence!.frequency === 'monthly' ? dayOfMonth : null,
        data.starts_at,
        data.ends_at,
        untilIso,
        maxOccurrences,
        data.create_google_event,
        data.create_meet,
        sendToClient,
        rRem,
      ],
    );
    recurrenceSeriesId = seriesIns.rows[0]?.id ?? null;
  }

  const connForGoogle = data.create_google_event ? await loadConnectionForUser(tenantId, userId) : null;
  if (data.create_google_event && !connForGoogle) {
    warnings.push('Conta Google não conectada; ocorrências foram criadas localmente com sync_status=error.');
  }

  const createdRows: AppointmentRow[] = [];
  for (const occ of plannedOccurrences) {
    const overlap = await pool.query<{ c: number }>(
      `SELECT count(*)::int AS c
       FROM public.appointments a
       WHERE a.tenant_id = $1
         AND a.responsible_user_id = $2
         AND a.status <> 'cancelled'
         AND a.starts_at < $3::timestamptz
         AND a.ends_at > $4::timestamptz`,
      [tenantId, data.responsible_user_id ?? null, occ.endsAtIso, occ.startsAtIso],
    );
    if ((overlap.rows[0]?.c ?? 0) > 0) {
      warnings.push(
        `Conflito detectado na ocorrência ${occ.index} (${new Date(occ.startsAtIso).toISOString()}).`,
      );
    }

    const ins = await pool.query<AppointmentRow>(
      `INSERT INTO public.appointments (
        tenant_id, client_id, lead_id, responsible_user_id, title, description, type, status,
        starts_at, ends_at, location, create_google_event, created_by, reminders_json, send_reminder_to_client,
        recurrence_series_id, recurrence_occurrence_index, recurrence_original_starts_at, sync_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8::timestamptz,$9::timestamptz,$10,$11,$12,$13::jsonb,$14,$15,$16,$17::timestamptz,$18)
      RETURNING *`,
      [
        tenantId,
        data.client_id ?? null,
        data.lead_id ?? null,
        data.responsible_user_id ?? null,
        data.title,
        data.description ?? null,
        data.type,
        occ.startsAtIso,
        occ.endsAtIso,
        data.location ?? null,
        data.create_google_event,
        userId,
        rRem,
        sendToClient,
        recurrenceSeriesId,
        recurrenceSeriesId ? occ.index : null,
        recurrenceSeriesId ? data.starts_at : null,
        data.create_google_event && !connForGoogle ? 'error' : 'not_synced',
      ],
    );
    const row = ins.rows[0] as AppointmentRow;
    createdRows.push(row);

    for (const at of data.attendees || []) {
      if (!at.email && !at.name) continue;
      await pool.query(
        `INSERT INTO public.appointment_attendees (appointment_id, name, email, phone, attendee_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, at.name ?? null, at.email ?? null, at.phone ?? null, at.attendee_type ?? 'external'],
      );
    }

    if (row.client_id && data.skip_initial_client_timeline !== true) {
      void createClientTimelineEvent({
        tenantId,
        clientId: row.client_id,
        eventName: 'agenda_appointment_created',
        source: 'agenda',
        actorType: 'user',
        actorId: userId,
        referenceType: 'appointment',
        referenceId: row.id,
        eventKey: `agenda:appointment:${row.id}:created`,
        metadata: { title: row.title, starts_at: row.starts_at, appointment_id: row.id },
      }).catch(() => {});
    }

    if (data.create_google_event) {
      if (!connForGoogle) {
        await pool.query(
          `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
          [row.id, 'Conta Google não conectada nas configurações.', tenantId],
        );
      } else {
        try {
          const gAtt = (data.attendees || [])
            .filter((x) => x.email && String(x.email).includes('@'))
            .map((x) => ({ email: String(x.email) }));
          const g = await createEvent(connForGoogle, {
            title: data.title,
            description: [data.description, data.location ? `Local: ${data.location}` : ''].filter(Boolean).join('\n\n'),
            start: occ.startsAtIso,
            end: occ.endsAtIso,
            attendees: gAtt.length ? gAtt : undefined,
            createMeet: data.create_meet,
            reminders: rems ?? undefined,
          });
          await pool.query(
            `UPDATE public.appointments SET
              google_calendar_connection_id = $2,
              google_event_id = $3,
              google_meet_link = $4,
              google_html_link = $5,
              sync_status = 'synced',
              sync_error = NULL
            WHERE id = $1 AND tenant_id = $6`,
            [row.id, connForGoogle.id, g.id, g.hangoutLink ?? null, g.htmlLink ?? null, tenantId],
          );
        } catch (e) {
          const err = sanitizeSyncError(e);
          warnings.push(`Falha ao sincronizar ocorrência ${occ.index} com Google Calendar.`);
          await pool.query(
            `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
            [row.id, err, tenantId],
          );
        }
      }
    }
  }

  const primaryId = createdRows[0]?.id;
  const finalRow = (await getAppointmentById(tenantId, primaryId, userId, { can_view: true })) as AppointmentRow;
  if (sendToClient) {
    const sendAll = recurrence?.send_invite_for_all_occurrences === true;
    const inviteTargets = sendAll ? createdRows : createdRows.slice(0, 1);
    for (const row of inviteTargets) {
      const rowForInvite = (await getAppointmentById(tenantId, row.id, userId, { can_view: true })) as AppointmentRow;
      void publishAppointmentInvite({
        pool,
        tenantId,
        actorUserId: userId,
        appointment: {
          id: rowForInvite.id,
          tenant_id: rowForInvite.tenant_id,
          title: rowForInvite.title,
          starts_at: rowForInvite.starts_at,
          client_id: rowForInvite.client_id,
          lead_id: rowForInvite.lead_id,
          responsible_user_id: rowForInvite.responsible_user_id,
          created_by: rowForInvite.created_by,
          google_meet_link: rowForInvite.google_meet_link,
          send_reminder_to_client: rowForInvite.send_reminder_to_client === true,
        },
      }).catch((e) => console.error('[appointments] publishAppointmentInvite', e));
    }
  }
  return { primary: finalRow, createdCount: createdRows.length, warnings };
}

export async function updateAppointment(
  tenantId: string,
  userId: string,
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    type: string;
    client_id: string | null;
    lead_id: string | null;
    responsible_user_id: string | null;
    starts_at: string;
    ends_at: string;
    location: string | null;
    create_google_event: boolean;
    create_meet: boolean;
    attendees: AttendeeIn[];
    reminders: GoogleCalendarReminder[] | null;
    send_reminder_to_client?: boolean;
  }>,
): Promise<AppointmentRow | null> {
  const current = await pool.query<AppointmentRow>(`SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]);
  if (!current.rows[0]) return null;
  const c = current.rows[0] as unknown as AppointmentRow;
  if (c.status === 'cancelled') return c;

  {
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [id, tenantId];
    let p = 3;
    if (data.title !== undefined) {
      sets.push(`title = $${p}`);
      vals.push(data.title);
      p += 1;
    }
    if (data.description !== undefined) {
      sets.push(`description = $${p}`);
      vals.push(data.description);
      p += 1;
    }
    if (data.type !== undefined) {
      sets.push(`type = $${p}`);
      vals.push(data.type);
      p += 1;
    }
    if (data.client_id !== undefined) {
      sets.push(`client_id = $${p}`);
      vals.push(data.client_id);
      p += 1;
    }
    if (data.lead_id !== undefined) {
      sets.push(`lead_id = $${p}`);
      vals.push(data.lead_id);
      p += 1;
    }
    if (data.responsible_user_id !== undefined) {
      sets.push(`responsible_user_id = $${p}`);
      vals.push(data.responsible_user_id);
      p += 1;
    }
    if (data.starts_at !== undefined) {
      sets.push(`starts_at = $${p}::timestamptz`);
      vals.push(data.starts_at);
      p += 1;
    }
    if (data.ends_at !== undefined) {
      sets.push(`ends_at = $${p}::timestamptz`);
      vals.push(data.ends_at);
      p += 1;
    }
    if (data.location !== undefined) {
      sets.push(`location = $${p}`);
      vals.push(data.location);
      p += 1;
    }
    if (data.create_google_event !== undefined) {
      sets.push(`create_google_event = $${p}`);
      vals.push(data.create_google_event);
      p += 1;
    }
    if (data.reminders !== undefined) {
      sets.push(`reminders_json = $${p}::jsonb`);
      vals.push(data.reminders == null ? null : JSON.stringify(data.reminders));
      p += 1;
    }
    if (data.send_reminder_to_client !== undefined) {
      sets.push(`send_reminder_to_client = $${p}`);
      vals.push(data.send_reminder_to_client);
      p += 1;
    }
    if (sets.length > 1) {
      await pool.query(`UPDATE public.appointments SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2`, vals);
    }
  }
  if (data.attendees) {
    await pool.query(`DELETE FROM public.appointment_attendees WHERE appointment_id = $1`, [id]);
    for (const at of data.attendees) {
      await pool.query(
        `INSERT INTO public.appointment_attendees (appointment_id, name, email, phone, attendee_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, at.name ?? null, at.email ?? null, at.phone ?? null, at.attendee_type ?? 'external'],
      );
    }
  }
  const upd = await pool.query<AppointmentRow>(`SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  const r = upd.rows[0] as unknown as AppointmentRow;
  if (r.client_id) {
    void createClientTimelineEvent({
      tenantId,
      clientId: r.client_id,
      eventName: 'agenda_appointment_updated',
      source: 'agenda',
      actorType: 'user',
      actorId: userId,
      referenceType: 'appointment',
      referenceId: id,
      eventKey: `agenda:appointment:${id}:updated:${Date.now()}`,
      metadata: { title: r.title, starts_at: r.starts_at, appointment_id: id },
    }).catch(() => {});
  }
  const wantGoogle = data.create_google_event !== undefined ? data.create_google_event : c.create_google_event;
  if (wantGoogle) {
    const conn = await loadConnectionForUser(tenantId, userId);
    if (!conn) {
      await pool.query(
        `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
        [id, 'Conta Google não conectada nas configurações.', tenantId],
      );
    } else if (r.google_event_id) {
      try {
        const atRows = (await listAttendees(id)) as { email: string }[];
        const gAtt = atRows
          .filter((x) => x.email)
          .map((x) => ({ email: String((x as { email: string }).email) }));
        const rem = remindersFromJson(
          r.reminders_json,
        ) ?? remindersFromJson(data.reminders) ?? (data.reminders as GoogleCalendarReminder[] | null) ?? null;
        const g = await updateCalendarEvent(conn, r.google_event_id, {
          title: r.title,
          description: [r.description, r.location ? `Local: ${r.location}` : ''].filter(Boolean).join('\n\n'),
          start: r.starts_at,
          end: r.ends_at,
          attendees: gAtt.length ? gAtt : undefined,
          createMeet: data.create_meet === true,
          reminders: rem,
        });
        await pool.query(
          `UPDATE public.appointments SET
            google_meet_link = $2, google_html_link = $3, sync_status = 'synced', sync_error = NULL,
            google_calendar_connection_id = $4
          WHERE id = $1 AND tenant_id = $5`,
          [id, g.hangoutLink ?? r.google_meet_link, g.htmlLink ?? r.google_html_link, conn.id, tenantId],
        );
      } catch (e) {
        const err = sanitizeSyncError(e);
        await pool.query(
          `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
          [id, err, tenantId],
        );
      }
    } else {
      try {
        const gAtt = (data.attendees
          ? data.attendees
          : ((await listAttendees(id)) as { email?: string }[])
        )
          .filter((x) => x.email && String(x.email).includes('@'))
          .map((x) => ({ email: String(x.email) }));
        const g = await createEvent(conn, {
          title: r.title,
          description: [r.description, r.location ? `Local: ${r.location}` : ''].filter(Boolean).join('\n\n'),
          start: r.starts_at,
          end: r.ends_at,
          attendees: gAtt.length ? gAtt : undefined,
          createMeet: data.create_meet === true,
          reminders: (data.reminders as GoogleCalendarReminder[] | null | undefined) ?? undefined,
        });
        await pool.query(
          `UPDATE public.appointments SET
            google_calendar_connection_id = $2, google_event_id = $3, google_meet_link = $4, google_html_link = $5,
            sync_status = 'synced', sync_error = NULL
          WHERE id = $1 AND tenant_id = $6`,
          [id, conn.id, g.id, g.hangoutLink, g.htmlLink, tenantId],
        );
      } catch (e) {
        const err = sanitizeSyncError(e);
        await pool.query(
          `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
          [id, err, tenantId],
        );
      }
    }
  }
  return (await getAppointmentById(tenantId, id, userId, { can_view: true })) as AppointmentRow;
}

export async function completeAppointment(params: {
  tenantId: string;
  userId: string;
  id: string;
  completionNotes?: string | null;
  outcome: AppointmentOutcome;
  createFollowUp: boolean;
  followUpStartsAt?: string | null;
  followUpEndsAt?: string | null;
  sendClientMessage: boolean;
}): Promise<{ appointment: AppointmentRow; followUp: AppointmentRow | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query<AppointmentRow>(
      `SELECT * FROM public.appointments
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [params.tenantId, params.id],
    );
    if (!cur.rows[0]) {
      throw new Error('Compromisso não encontrado.');
    }
    const c = cur.rows[0] as AppointmentRow;
    if (c.status !== 'scheduled') {
      throw new Error('Apenas compromissos agendados podem ser concluídos.');
    }

    const done = await client.query<AppointmentRow>(
      `UPDATE public.appointments
       SET status = 'done',
           completed_at = now(),
           completion_notes = $3,
           outcome = $4,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        params.id,
        params.tenantId,
        params.completionNotes?.trim() ? params.completionNotes.trim() : null,
        params.outcome,
      ],
    );
    const doneRow = done.rows[0] as AppointmentRow;

    let followUp: AppointmentRow | null = null;
    if (params.createFollowUp) {
      if (!params.followUpStartsAt || !params.followUpEndsAt) {
        throw new Error('Data/hora do follow-up obrigatória.');
      }
      const startDt = new Date(params.followUpStartsAt);
      const endDt = new Date(params.followUpEndsAt);
      if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime()) || endDt <= startDt) {
        throw new Error('Intervalo do follow-up inválido.');
      }

      const fu = await client.query<AppointmentRow>(
        `INSERT INTO public.appointments (
           tenant_id, client_id, lead_id, responsible_user_id, title, description, type, status,
           starts_at, ends_at, location, create_google_event, created_by, reminders_json, send_reminder_to_client,
           sync_status
         ) VALUES (
           $1, $2, $3, $4, $5, NULL, $6, 'scheduled',
           $7::timestamptz, $8::timestamptz, $9, false, $10, $11::jsonb, false, 'not_synced'
         )
         RETURNING *`,
        [
          c.tenant_id,
          c.client_id,
          c.lead_id,
          c.responsible_user_id,
          `Follow-up: ${c.title}`,
          c.type || 'meeting',
          params.followUpStartsAt,
          params.followUpEndsAt,
          c.location,
          params.userId,
          JSON.stringify([
            { method: 'popup', minutes: 10 },
            { method: 'popup', minutes: 60 },
          ]),
        ],
      );
      followUp = fu.rows[0] as AppointmentRow;
    }

    await client.query('COMMIT');

    if (doneRow.client_id) {
      void createClientTimelineEvent({
        tenantId: params.tenantId,
        clientId: doneRow.client_id,
        eventName: 'agenda_appointment_completed',
        source: 'agenda',
        actorType: 'user',
        actorId: params.userId,
        referenceType: 'appointment',
        referenceId: doneRow.id,
        eventKey: `agenda:appointment:${doneRow.id}:completed`,
        metadata: {
          title: doneRow.title,
          appointment_id: doneRow.id,
          outcome: doneRow.outcome ?? null,
          completion_notes: doneRow.completion_notes ?? null,
        },
      }).catch(() => {});

      if (followUp) {
        void createClientTimelineEvent({
          tenantId: params.tenantId,
          clientId: doneRow.client_id,
          eventName: 'agenda_appointment_follow_up_created',
          source: 'agenda',
          actorType: 'user',
          actorId: params.userId,
          referenceType: 'appointment',
          referenceId: followUp.id,
          eventKey: `agenda:appointment:${doneRow.id}:follow-up:${followUp.id}`,
          metadata: {
            title: followUp.title,
            starts_at: followUp.starts_at,
            source_appointment_id: doneRow.id,
          },
        }).catch(() => {});
      }
    }

    if (params.sendClientMessage) {
      void publishAppointmentCompleted({
        pool,
        tenantId: params.tenantId,
        actorUserId: params.userId,
        appointment: {
          id: doneRow.id,
          tenant_id: doneRow.tenant_id,
          title: doneRow.title,
          starts_at: doneRow.starts_at,
          client_id: doneRow.client_id,
          lead_id: doneRow.lead_id,
          responsible_user_id: doneRow.responsible_user_id,
          created_by: doneRow.created_by,
          google_meet_link: doneRow.google_meet_link,
          send_reminder_to_client: true,
        },
        completionNotes: doneRow.completion_notes ?? '',
        followUpStartsAt: followUp?.starts_at ?? null,
      }).catch((e) => console.error('[appointments] publishAppointmentCompleted', e));
    }

    const appointment = (await getAppointmentById(params.tenantId, doneRow.id, params.userId, {
      can_view: true,
    })) as AppointmentRow;
    const followUpRow =
      followUp &&
      ((await getAppointmentById(params.tenantId, followUp.id, params.userId, {
        can_view: true,
      })) as AppointmentRow);
    return { appointment, followUp: followUpRow ?? null };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* noop */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function cancelAppointment(
  tenantId: string,
  userId: string,
  id: string,
): Promise<AppointmentRow | null> {
  const cur = await pool.query<AppointmentRow>(
    `SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, id],
  );
  if (!cur.rows[0]) return null;
  const c = cur.rows[0] as unknown as AppointmentRow;
  if (c.google_event_id) {
    const conn = await loadConnectionForUser(tenantId, userId);
    if (conn) {
      try {
        await deleteCalendarEvent(conn, c.google_event_id);
      } catch {
        /* manter soft cancel se Google falhar */
      }
    }
  }
  await pool.query(
    `UPDATE public.appointments SET
      status = 'cancelled',
      cancelled_at = now(),
      sync_status = 'cancelled',
      updated_at = now()
    WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (c.client_id) {
    void createClientTimelineEvent({
      tenantId,
      clientId: c.client_id,
      eventName: 'agenda_appointment_cancelled',
      source: 'agenda',
      actorType: 'user',
      actorId: userId,
      referenceType: 'appointment',
      referenceId: id,
      eventKey: `agenda:appointment:${id}:cancelled:${Date.now()}`,
      metadata: { title: c.title, appointment_id: id },
    }).catch(() => {});
  }
  return (await getAppointmentById(tenantId, id, userId, { can_view: true })) as AppointmentRow;
}

type RecurrenceCancelResult = {
  cancelled_count: number;
  google_failed_count: number;
  series_id: string;
};

async function cancelRowsInRecurrence(params: {
  tenantId: string;
  userId: string;
  rows: AppointmentRow[];
  seriesId: string;
}): Promise<RecurrenceCancelResult> {
  const { tenantId, userId, rows, seriesId } = params;
  let googleFailed = 0;
  const conn = await loadConnectionForUser(tenantId, userId);

  for (const row of rows) {
    if (row.google_event_id && conn) {
      try {
        await deleteCalendarEvent(conn, row.google_event_id);
      } catch {
        googleFailed += 1;
      }
    }
    await pool.query(
      `UPDATE public.appointments
       SET status = 'cancelled',
           cancelled_at = now(),
           sync_status = 'cancelled',
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [row.id, tenantId],
    );
    if (row.client_id) {
      void createClientTimelineEvent({
        tenantId,
        clientId: row.client_id,
        eventName: 'agenda_appointment_cancelled',
        source: 'agenda',
        actorType: 'user',
        actorId: userId,
        referenceType: 'appointment',
        referenceId: row.id,
        eventKey: `agenda:appointment:${row.id}:cancelled:recurrence:${Date.now()}`,
        metadata: { title: row.title, appointment_id: row.id, recurrence_series_id: seriesId },
      }).catch(() => {});
    }
  }

  return {
    cancelled_count: rows.length,
    google_failed_count: googleFailed,
    series_id: seriesId,
  };
}

export async function cancelRecurrenceSeries(
  tenantId: string,
  userId: string,
  seriesId: string,
): Promise<RecurrenceCancelResult> {
  const rowsR = await pool.query<AppointmentRow>(
    `SELECT *
     FROM public.appointments
     WHERE tenant_id = $1
       AND recurrence_series_id = $2
       AND status <> 'cancelled'
     ORDER BY starts_at ASC`,
    [tenantId, seriesId],
  );
  const rows = rowsR.rows;
  const result = await cancelRowsInRecurrence({ tenantId, userId, rows, seriesId });
  await pool.query(
    `UPDATE public.appointment_recurrence_series
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, seriesId],
  );
  return result;
}

export async function cancelThisAndFollowingRecurrence(
  tenantId: string,
  userId: string,
  appointmentId: string,
): Promise<RecurrenceCancelResult> {
  const baseR = await pool.query<AppointmentRow>(
    `SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );
  const base = baseR.rows[0];
  if (!base || !base.recurrence_series_id || !base.recurrence_occurrence_index) {
    throw new Error('Compromisso não pertence a uma série recorrente.');
  }
  const rowsR = await pool.query<AppointmentRow>(
    `SELECT *
     FROM public.appointments
     WHERE tenant_id = $1
       AND recurrence_series_id = $2
       AND recurrence_occurrence_index >= $3
       AND status <> 'cancelled'
     ORDER BY recurrence_occurrence_index ASC`,
    [tenantId, base.recurrence_series_id, base.recurrence_occurrence_index],
  );
  const rows = rowsR.rows;
  return cancelRowsInRecurrence({
    tenantId,
    userId,
    rows,
    seriesId: base.recurrence_series_id,
  });
}

type RecurrenceUpdateResult = {
  updated_count: number;
  google_failed_count: number;
};

async function patchRecurringRows(params: {
  tenantId: string;
  userId: string;
  rows: AppointmentRow[];
  patch: RecurrenceSeriesPatchInput;
}): Promise<RecurrenceUpdateResult> {
  const { tenantId, userId, rows, patch } = params;
  const conn = await loadConnectionForUser(tenantId, userId);
  let updated = 0;
  let googleFailed = 0;

  for (const row of rows) {
    const sets: string[] = ['updated_at = now()'];
    const vals: unknown[] = [row.id, tenantId];
    let p = 3;
    if (patch.title !== undefined) {
      sets.push(`title = $${p}`);
      vals.push(patch.title);
      p += 1;
    }
    if (patch.description !== undefined) {
      sets.push(`description = $${p}`);
      vals.push(patch.description);
      p += 1;
    }
    if (patch.type !== undefined) {
      sets.push(`type = $${p}`);
      vals.push(patch.type);
      p += 1;
    }
    if (patch.responsible_user_id !== undefined) {
      sets.push(`responsible_user_id = $${p}`);
      vals.push(patch.responsible_user_id);
      p += 1;
    }
    if (patch.location !== undefined) {
      sets.push(`location = $${p}`);
      vals.push(patch.location);
      p += 1;
    }
    if (patch.reminders !== undefined) {
      sets.push(`reminders_json = $${p}::jsonb`);
      vals.push(patch.reminders == null ? null : JSON.stringify(patch.reminders));
      p += 1;
    }
    if (patch.send_reminder_to_client !== undefined) {
      sets.push(`send_reminder_to_client = $${p}`);
      vals.push(patch.send_reminder_to_client);
      p += 1;
    }
    await pool.query(`UPDATE public.appointments SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2`, vals);
    updated += 1;

    if (row.create_google_event && row.google_event_id && conn) {
      const latest = await pool.query<AppointmentRow>(
        `SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2`,
        [tenantId, row.id],
      );
      const cur = latest.rows[0];
      try {
        const attendees = (await listAttendees(row.id)) as { email?: string }[];
        const gAtt = attendees
          .filter((x) => x.email)
          .map((x) => ({ email: String((x as { email: string }).email) }));
        const rem = remindersFromJson(cur.reminders_json) ?? null;
        const g = await updateCalendarEvent(conn, cur.google_event_id ?? row.google_event_id, {
          title: cur.title,
          description: [cur.description, cur.location ? `Local: ${cur.location}` : ''].filter(Boolean).join('\n\n'),
          start: cur.starts_at,
          end: cur.ends_at,
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
          [row.id, g.hangoutLink ?? cur.google_meet_link, g.htmlLink ?? cur.google_html_link, conn.id, tenantId],
        );
      } catch (e) {
        googleFailed += 1;
        const err = sanitizeSyncError(e);
        await pool.query(
          `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
          [row.id, err, tenantId],
        );
      }
    }
  }
  return { updated_count: updated, google_failed_count: googleFailed };
}

export async function patchRecurrenceSeries(
  tenantId: string,
  userId: string,
  seriesId: string,
  patch: RecurrenceSeriesPatchInput,
): Promise<RecurrenceUpdateResult> {
  const rowsR = await pool.query<AppointmentRow>(
    `SELECT *
     FROM public.appointments
     WHERE tenant_id = $1
       AND recurrence_series_id = $2
       AND status NOT IN ('cancelled', 'done')
       AND starts_at >= now()
     ORDER BY starts_at ASC`,
    [tenantId, seriesId],
  );
  const result = await patchRecurringRows({ tenantId, userId, rows: rowsR.rows, patch });
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [seriesId, tenantId];
  let p = 3;
  if (patch.title !== undefined) { sets.push(`title = $${p}`); vals.push(patch.title); p += 1; }
  if (patch.description !== undefined) { sets.push(`description = $${p}`); vals.push(patch.description); p += 1; }
  if (patch.type !== undefined) { sets.push(`type = $${p}`); vals.push(patch.type); p += 1; }
  if (patch.responsible_user_id !== undefined) { sets.push(`responsible_user_id = $${p}`); vals.push(patch.responsible_user_id); p += 1; }
  if (patch.location !== undefined) { sets.push(`location = $${p}`); vals.push(patch.location); p += 1; }
  if (patch.reminders !== undefined) { sets.push(`reminders_json = $${p}::jsonb`); vals.push(patch.reminders == null ? null : JSON.stringify(patch.reminders)); p += 1; }
  if (patch.send_reminder_to_client !== undefined) { sets.push(`send_reminder_to_client = $${p}`); vals.push(patch.send_reminder_to_client); p += 1; }
  await pool.query(
    `UPDATE public.appointment_recurrence_series SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2`,
    vals,
  );
  return result;
}

export async function patchThisAndFollowingRecurrence(
  tenantId: string,
  userId: string,
  appointmentId: string,
  patch: RecurrenceSeriesPatchInput,
): Promise<RecurrenceUpdateResult> {
  const baseR = await pool.query<AppointmentRow>(
    `SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );
  const base = baseR.rows[0];
  if (!base || !base.recurrence_series_id || !base.recurrence_occurrence_index) {
    throw new Error('Compromisso não pertence a uma série recorrente.');
  }
  const rowsR = await pool.query<AppointmentRow>(
    `SELECT *
     FROM public.appointments
     WHERE tenant_id = $1
       AND recurrence_series_id = $2
       AND recurrence_occurrence_index >= $3
       AND status NOT IN ('cancelled', 'done')
     ORDER BY recurrence_occurrence_index ASC`,
    [tenantId, base.recurrence_series_id, base.recurrence_occurrence_index],
  );
  return patchRecurringRows({ tenantId, userId, rows: rowsR.rows, patch });
}

export async function retrySyncAppointment(
  tenantId: string,
  userId: string,
  id: string,
  createMeet?: boolean,
): Promise<AppointmentRow | null> {
  const a = await pool.query<AppointmentRow>(`SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  if (!a.rows[0]) return null;
  const row = a.rows[0] as unknown as AppointmentRow;
  if (row.status === 'cancelled' || !row.create_google_event) {
    return row;
  }
  if (row.sync_status !== 'error' && row.sync_status !== 'not_synced') {
    return (await getAppointmentById(tenantId, id, userId, { can_view: true })) as AppointmentRow;
  }
  const conn = await loadConnectionForUser(tenantId, userId);
  if (!conn) {
    await pool.query(
      `UPDATE public.appointments SET sync_error = $2, sync_status = 'error' WHERE id = $1 AND tenant_id = $3`,
      [id, 'Conta Google não conectada nas configurações.', tenantId],
    );
    return (await getAppointmentById(tenantId, id, userId, { can_view: true })) as AppointmentRow;
  }
  const attendees = (await listAttendees(id)) as { email?: string }[];
  const gAtt = attendees
    .filter((x) => x.email)
    .map((x) => ({ email: String((x as { email: string }).email) }));
  const rem = remindersFromJson(row.reminders_json) ?? null;
  try {
    if (row.google_event_id) {
      const g = await updateCalendarEvent(conn, row.google_event_id, {
        title: row.title,
        description: [row.description, row.location ? `Local: ${row.location}` : ''].filter(Boolean).join('\n\n'),
        start: row.starts_at,
        end: row.ends_at,
        attendees: gAtt.length ? gAtt : undefined,
        createMeet: createMeet === true,
        reminders: rem,
      });
      await pool.query(
        `UPDATE public.appointments SET
          google_meet_link = $2, google_html_link = $3, sync_status = 'synced', sync_error = NULL,
          google_calendar_connection_id = $4
        WHERE id = $1 AND tenant_id = $5`,
        [id, g.hangoutLink ?? null, g.htmlLink ?? null, conn.id, tenantId],
      );
    } else {
      const g = await createEvent(conn, {
        title: row.title,
        description: [row.description, row.location ? `Local: ${row.location}` : ''].filter(Boolean).join('\n\n'),
        start: row.starts_at,
        end: row.ends_at,
        attendees: gAtt.length ? gAtt : undefined,
        createMeet: createMeet === true,
        reminders: rem ?? undefined,
      });
      await pool.query(
        `UPDATE public.appointments SET
          google_calendar_connection_id = $2, google_event_id = $3, google_meet_link = $4, google_html_link = $5,
          sync_status = 'synced', sync_error = NULL
        WHERE id = $1 AND tenant_id = $6`,
        [id, conn.id, g.id, g.hangoutLink, g.htmlLink, tenantId],
      );
    }
  } catch (e) {
    const err = sanitizeSyncError(e);
    await pool.query(
      `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
      [id, err, tenantId],
    );
  }
  return (await getAppointmentById(tenantId, id, userId, { can_view: true })) as AppointmentRow;
}

export async function rescheduleAppointment(params: {
  tenantId: string;
  userId: string;
  id: string;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
}): Promise<AppointmentRow | null> {
  const cur = await pool.query<AppointmentRow>(
    `SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [params.tenantId, params.id],
  );
  if (!cur.rows[0]) return null;
  const before = cur.rows[0] as AppointmentRow;
  if (before.status !== 'scheduled') {
    throw new Error('Apenas compromissos agendados podem ser reagendados.');
  }
  const next = await pool.query<AppointmentRow>(
    `UPDATE public.appointments
     SET starts_at = $3::timestamptz,
         ends_at = $4::timestamptz,
         updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [params.tenantId, params.id, params.startsAt, params.endsAt],
  );
  const row = next.rows[0] as AppointmentRow;

  if (row.google_event_id) {
    const conn = await loadConnectionForUser(params.tenantId, params.userId);
    if (conn) {
      try {
        const attendees = (await listAttendees(row.id)) as { email?: string }[];
        const gAtt = attendees.filter((x) => x.email).map((x) => ({ email: String(x.email) }));
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
          [row.id, g.hangoutLink ?? row.google_meet_link, g.htmlLink ?? row.google_html_link, conn.id, params.tenantId],
        );
      } catch (e) {
        const err = sanitizeSyncError(e);
        await pool.query(
          `UPDATE public.appointments
           SET sync_status = 'error', sync_error = $2
           WHERE id = $1 AND tenant_id = $3`,
          [row.id, err, params.tenantId],
        );
      }
    } else {
      await pool.query(
        `UPDATE public.appointments
         SET sync_status = 'error', sync_error = $2
         WHERE id = $1 AND tenant_id = $3`,
        [row.id, 'Conta Google não conectada nas configurações.', params.tenantId],
      );
    }
  }

  if (row.client_id) {
    void createClientTimelineEvent({
      tenantId: params.tenantId,
      clientId: row.client_id,
      eventName: 'agenda_appointment_rescheduled',
      source: 'agenda',
      actorType: 'user',
      actorId: params.userId,
      referenceType: 'appointment',
      referenceId: row.id,
      eventKey: `agenda:appointment:${row.id}:rescheduled:${Date.now()}`,
      metadata: {
        title: row.title,
        appointment_id: row.id,
        old_starts_at: before.starts_at,
        old_ends_at: before.ends_at,
        new_starts_at: params.startsAt,
        new_ends_at: params.endsAt,
        reason: params.reason ?? null,
      },
    }).catch(() => {});
  }

  return (await getAppointmentById(params.tenantId, row.id, params.userId, { can_view: true })) as AppointmentRow;
}

export async function setAppointmentAttendance(params: {
  tenantId: string;
  userId: string;
  id: string;
  attendanceStatus: 'pending' | 'confirmed' | 'not_confirmed' | 'no_show';
  attendanceNote?: string | null;
}): Promise<AppointmentRow | null> {
  const cur = await pool.query<AppointmentRow>(
    `SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [params.tenantId, params.id],
  );
  if (!cur.rows[0]) return null;
  const before = cur.rows[0] as AppointmentRow;
  if (before.status !== 'scheduled') {
    throw new Error('A confirmação de presença só pode ser alterada em compromissos agendados.');
  }

  const isNoShow = params.attendanceStatus === 'no_show';
  const next = await pool.query<AppointmentRow>(
    `UPDATE public.appointments
     SET attendance_status = $3,
         attendance_note = $4,
         attendance_updated_at = now(),
         attendance_confirmed_at = CASE WHEN $3 = 'confirmed' THEN now() ELSE NULL END,
         status = CASE WHEN $3 = 'no_show' THEN 'done' ELSE status END,
         outcome = CASE WHEN $3 = 'no_show' THEN 'no_show' ELSE outcome END,
         completed_at = CASE WHEN $3 = 'no_show' THEN now() ELSE completed_at END,
         updated_at = now()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [params.tenantId, params.id, params.attendanceStatus, params.attendanceNote?.trim() || null],
  );
  const row = next.rows[0] as AppointmentRow;

  if (row.client_id) {
    const eventName =
      params.attendanceStatus === 'confirmed'
        ? 'agenda_attendance_confirmed'
        : params.attendanceStatus === 'not_confirmed'
          ? 'agenda_attendance_not_confirmed'
          : params.attendanceStatus === 'no_show'
            ? 'agenda_attendance_no_show'
            : 'agenda_appointment_updated';
    void createClientTimelineEvent({
      tenantId: params.tenantId,
      clientId: row.client_id,
      eventName,
      source: 'agenda',
      actorType: 'user',
      actorId: params.userId,
      referenceType: 'appointment',
      referenceId: row.id,
      eventKey: `agenda:appointment:${row.id}:attendance:${Date.now()}`,
      metadata: {
        appointment_id: row.id,
        starts_at: row.starts_at,
        previous_status: before.attendance_status ?? 'pending',
        new_status: params.attendanceStatus,
        note: params.attendanceNote ?? null,
        no_show_applied: isNoShow,
      },
    }).catch(() => {});
  }

  return (await getAppointmentById(params.tenantId, row.id, params.userId, { can_view: true })) as AppointmentRow;
}

export async function requestAppointmentConfirmation(params: {
  tenantId: string;
  userId: string;
  id: string;
  note?: string | null;
}): Promise<{
  appointment: AppointmentRow;
  dispatch: {
    ok: boolean;
    status: 'sent' | 'skipped' | 'failed';
    reason?: string;
    delivery_id?: string | null;
  };
}> {
  const cur = await pool.query<AppointmentRow>(
    `SELECT * FROM public.appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [params.tenantId, params.id],
  );
  if (!cur.rows[0]) throw new Error('Compromisso não encontrado.');
  const row = cur.rows[0] as AppointmentRow;
  if (row.status !== 'scheduled') {
    throw new Error('Só é possível solicitar confirmação em compromissos agendados.');
  }

  await pool.query(
    `UPDATE public.appointments
     SET attendance_status = 'pending',
         attendance_updated_at = now(),
         attendance_note = COALESCE($3, attendance_note),
         updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.id, params.note?.trim() || null],
  );

  const dispatch = await publishAppointmentConfirmationRequest({
    pool,
    tenantId: params.tenantId,
    actorUserId: params.userId,
    appointment: {
      id: row.id,
      tenant_id: row.tenant_id,
      title: row.title,
      starts_at: row.starts_at,
      client_id: row.client_id,
      lead_id: row.lead_id,
      responsible_user_id: row.responsible_user_id,
      created_by: row.created_by,
      google_meet_link: row.google_meet_link,
      location: row.location,
      send_reminder_to_client: row.send_reminder_to_client === true,
    },
    confirmationLink: (
      await ensureAppointmentPublicConfirmationToken({
        tenantId: params.tenantId,
        appointmentId: row.id,
        appointmentEndsAt: row.ends_at,
        currentToken: row.public_confirmation_token ?? null,
        currentExpiresAt: row.public_confirmation_token_expires_at ?? null,
      })
    ).confirmationLink,
  });

  if (row.client_id) {
    void createClientTimelineEvent({
      tenantId: params.tenantId,
      clientId: row.client_id,
      eventName: 'agenda_confirmation_requested',
      source: 'agenda',
      actorType: 'user',
      actorId: params.userId,
      referenceType: 'appointment',
      referenceId: row.id,
      eventKey: `agenda:appointment:${row.id}:confirmation-request:${Date.now()}`,
      metadata: {
        appointment_id: row.id,
        title: row.title,
        starts_at: row.starts_at,
        responsible_user_id: row.responsible_user_id,
        note: params.note ?? null,
        delivery_status: dispatch.status,
        delivery_id: dispatch.delivery_id ?? null,
        reason: dispatch.reason ?? null,
      },
    }).catch(() => {});
  }

  const appointment = (await getAppointmentById(params.tenantId, row.id, params.userId, {
    can_view: true,
  })) as AppointmentRow;
  return { appointment, dispatch };
}

export { listAttendees };
