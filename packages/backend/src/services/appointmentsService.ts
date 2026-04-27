import { pool } from '../utils/db.js';
import {
  createEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  loadConnectionForUser,
} from './googleCalendarService.js';
import { createClientTimelineEvent } from './clientTimelineEventsService.js';
import { getUserRoleInTenant, getEffectiveModulePermissions } from './modulePermissionsService.js';
import type { GoogleCalendarReminder } from './googleCalendarService.js';

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
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  client_name?: string | null;
  lead_name?: string | null;
  responsible_name?: string | null;
  created_by_name?: string | null;
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

  const where = `WHERE ${conds.join(' AND ')}`;
  const countQ = `SELECT count(*)::int AS c FROM public.appointments a ${where}`;
  const countR = await pool.query<{ c: number }>(countQ, args);
  const total = countR.rows[0]?.c ?? 0;

  const lim = n;
  const off = n + 1;
  const q = `
    SELECT
      a.*,
      c.name AS client_name,
      l.name AS lead_name,
      u_resp.email AS responsible_name,
      u_c.email AS created_by_name
    FROM public.appointments a
    LEFT JOIN public.clients c ON c.id = a.client_id
    LEFT JOIN public.leads l ON l.id = a.lead_id
    LEFT JOIN public.users u_resp ON u_resp.id = a.responsible_user_id
    LEFT JOIN public.users u_c ON u_c.id = a.created_by
    ${where}
    ORDER BY a.starts_at ASC, a.id ASC
    LIMIT $${lim} OFFSET $${off}
  `;
  const listArgs = [...args, params.limit, params.offset];
  const r = await pool.query<AppointmentRow & Record<string, unknown>>(q, listArgs);
  return { items: r.rows as AppointmentRow[], total };
}

export async function getAppointmentById(
  tenantId: string,
  id: string,
  userId: string,
  agendaPerm: { can_view?: boolean; edit_own_only?: boolean } | undefined,
): Promise<AppointmentRow | null> {
  if (agendaPerm && agendaPerm.can_view === false) return null;
  const r = await pool.query<AppointmentRow & Record<string, unknown>>(
    `SELECT
       a.*,
       c.name AS client_name,
       l.name AS lead_name,
       u_resp.email AS responsible_name,
       u_c.email AS created_by_name
     FROM public.appointments a
     LEFT JOIN public.clients c ON c.id = a.client_id
     LEFT JOIN public.leads l ON l.id = a.lead_id
     LEFT JOIN public.users u_resp ON u_resp.id = a.responsible_user_id
     LEFT JOIN public.users u_c ON u_c.id = a.created_by
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
  },
): Promise<AppointmentRow> {
  if (data.client_id && data.lead_id) {
    throw new Error('Informe cliente ou lead, não ambos.');
  }
  const rRem = data.reminders ? JSON.stringify(data.reminders) : null;
  const ins = await pool.query<AppointmentRow>(
    `INSERT INTO public.appointments (
      tenant_id, client_id, lead_id, responsible_user_id, title, description, type, status,
      starts_at, ends_at, location, create_google_event, created_by, reminders_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8::timestamptz,$9::timestamptz,$10,$11,$12,$13::jsonb)
    RETURNING *`,
    [
      tenantId,
      data.client_id ?? null,
      data.lead_id ?? null,
      data.responsible_user_id ?? null,
      data.title,
      data.description ?? null,
      data.type,
      data.starts_at,
      data.ends_at,
      data.location ?? null,
      data.create_google_event,
      userId,
      rRem,
    ],
  );
  const row = ins.rows[0] as unknown as AppointmentRow;
  for (const at of data.attendees || []) {
    if (!at.email && !at.name) continue;
    await pool.query(
      `INSERT INTO public.appointment_attendees (appointment_id, name, email, phone, attendee_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        row.id,
        at.name ?? null,
        at.email ?? null,
        at.phone ?? null,
        at.attendee_type ?? 'external',
      ],
    );
  }
  if (row.client_id) {
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
    const conn = await loadConnectionForUser(tenantId, userId);
    if (!conn) {
      await pool.query(
        `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
        [row.id, 'Conta Google não conectada nas configurações.', tenantId],
      );
      const re = await getAppointmentById(tenantId, row.id, userId, { can_view: true });
      return re!;
    }
    try {
      const gAtt = (data.attendees || [])
        .filter((x) => x.email && String(x.email).includes('@'))
        .map((x) => ({ email: String(x.email) }));
      const g = await createEvent(conn, {
        title: data.title,
        description: [data.description, data.location ? `Local: ${data.location}` : ''].filter(Boolean).join('\n\n'),
        start: data.starts_at,
        end: data.ends_at,
        attendees: gAtt.length ? gAtt : undefined,
        createMeet: data.create_meet,
        reminders: data.reminders ?? undefined,
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
        [row.id, conn.id, g.id, g.hangoutLink ?? null, g.htmlLink ?? null, tenantId],
      );
    } catch (e) {
      const err = sanitizeSyncError(e);
      await pool.query(
        `UPDATE public.appointments SET sync_status = 'error', sync_error = $2 WHERE id = $1 AND tenant_id = $3`,
        [row.id, err, tenantId],
      );
    }
  } else {
    await pool.query(
      `UPDATE public.appointments SET sync_status = 'not_synced' WHERE id = $1 AND tenant_id = $2`,
      [row.id, tenantId],
    );
  }
  return (await getAppointmentById(tenantId, row.id, userId, { can_view: true })) as AppointmentRow;
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

export { listAttendees };
