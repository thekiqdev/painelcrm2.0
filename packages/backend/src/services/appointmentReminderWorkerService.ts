import { pool } from '../utils/db.js';
import { createNotification } from './notifications.js';
import { getEffectiveModulePermissions } from './modulePermissionsService.js';
import type { GoogleCalendarReminder } from './googleCalendarService.js';
import { publishAppointmentClientReminder } from './notificationsEngine/appointmentTransactionalNotifications.js';

function remindersFromJson(v: unknown): GoogleCalendarReminder[] | null {
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
  return null;
}

type ApRow = {
  id: string;
  tenant_id: string;
  title: string;
  starts_at: string;
  reminders_json: unknown;
  responsible_user_id: string | null;
  created_by: string | null;
  client_name: string | null;
  client_id: string | null;
  lead_id: string | null;
  google_meet_link: string | null;
  send_reminder_to_client: boolean;
};

const REMINDER_SPECS: {
  logType: '10m' | '30m' | '60m' | '1d';
  outboundType: '10m' | '30m' | '60m' | '1440m';
  minutes: number;
  label: string;
  messageLead: string;
}[] = [
  { logType: '10m', outboundType: '10m', minutes: 10, label: '10 minutos', messageLead: 'em 10 minutos' },
  { logType: '30m', outboundType: '30m', minutes: 30, label: '30 minutos', messageLead: 'em 30 minutos' },
  { logType: '60m', outboundType: '60m', minutes: 60, label: '1 hora', messageLead: 'em 1 hora' },
  { logType: '1d', outboundType: '1440m', minutes: 24 * 60, label: '1 dia', messageLead: 'em 1 dia' },
];

function getConfiguredMinutes(rj: unknown): number[] {
  const list: GoogleCalendarReminder[] | null | undefined = remindersFromJson(rj);
  if (list == null) return [];
  return list.map((x) => x.minutes).filter((m) => typeof m === 'number');
}

/**
 * Lembretes padrão quando o compromisso não traz configuração (dados antigos).
 */
const DEFAULT_MINUTES: number[] = [10, 60];

function minutesInclude(configured: number[], m: number, useDefault: boolean): boolean {
  if (configured.length > 0) {
    return configured.includes(m);
  }
  return useDefault && DEFAULT_MINUTES.includes(m);
}

function inFireWindow(startsAtMs: number, nowMs: number, leadMinutes: number): boolean {
  const fireAt = startsAtMs - leadMinutes * 60_000;
  const lateMs = 5 * 60_000; // reexecutar se o job voltar até 5 min depois
  return nowMs >= fireAt - 30_000 && nowMs < fireAt + lateMs;
}

/**
 * Escanear compromissos e enviar notificações internas (1x por reminder_type / compromisso).
 * Executado a cada minuto; tolera atraso curto no tick.
 */
export async function runAppointmentRemindersOnce(): Promise<{ checked: number; sent: number }> {
  let sent = 0;
  const r = await pool.query<ApRow>(
    `SELECT
       a.id,
       a.tenant_id,
       a.title,
       a.starts_at,
       a.reminders_json,
       a.responsible_user_id,
       a.created_by,
       a.client_id,
       a.lead_id,
       a.google_meet_link,
       COALESCE(a.send_reminder_to_client, false) AS send_reminder_to_client,
       c.name AS client_name
     FROM public.appointments a
     LEFT JOIN public.clients c ON c.id = a.client_id
     WHERE a.status = 'scheduled'
       AND a.starts_at > now() - interval '1 minute'
       AND a.starts_at < now() + interval '2 days'`,
  );

  const nowMs = Date.now();
  const configuredList = (rows: ApRow) => {
    const mins = getConfiguredMinutes(rows.reminders_json);
    return mins;
  };

  for (const row of r.rows) {
    const starts = new Date(row.starts_at).getTime();
    if (Number.isNaN(starts)) continue;
    const userId = row.responsible_user_id || row.created_by;
    if (!userId) continue;

    const perms = await getEffectiveModulePermissions(userId);
    const p = perms['agenda'];
    if (p && p.can_view === false) {
      continue;
    }

    const conf = configuredList(row);
    /* NULL em reminders_json: compromissos antigos / padrão. Array vazio: utilizador desativou todos os lembretes. */
    const useDefault = row.reminders_json == null;

    for (const spec of REMINDER_SPECS) {
      if (!minutesInclude(conf, spec.minutes, useDefault)) {
        continue;
      }
      if (!inFireWindow(starts, nowMs, spec.minutes)) {
        continue;
      }

      const ins = await pool.query(
        `INSERT INTO public.appointment_notifications_log (appointment_id, reminder_type)
         VALUES ($1, $2)
         ON CONFLICT (appointment_id, reminder_type) DO NOTHING
         RETURNING id`,
        [row.id, spec.logType],
      );

      const subtitle = row.client_name
        ? `${row.title} — com ${row.client_name}`
        : row.title;
      const message = `Você tem um compromisso ${spec.messageLead}:\n${subtitle}`;

      if ((ins.rowCount ?? 0) > 0) {
        try {
          await createNotification({
            userId,
            type: 'agenda_reminder',
            title: `Compromisso: ${row.title}`,
            message,
            data: {
              appointment_id: row.id,
              tenant_id: row.tenant_id,
              reminder_type: spec.logType,
              href: `/agenda?appointment_id=${encodeURIComponent(row.id)}`,
            },
          });
          sent += 1;
        } catch (e) {
          console.error('[appointmentReminder] createNotification', row.id, spec.logType, e);
          await pool.query(
            `DELETE FROM public.appointment_notifications_log WHERE appointment_id = $1 AND reminder_type = $2`,
            [row.id, spec.logType],
          );
        }
      }

      if (row.send_reminder_to_client) {
        void publishAppointmentClientReminder({
          pool,
          tenantId: row.tenant_id,
          reminderType: spec.outboundType,
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
            send_reminder_to_client: row.send_reminder_to_client,
          },
        }).catch((err) =>
          console.error('[appointmentReminder] publishAppointmentClientReminder', row.id, spec.outboundType, err),
        );
      }
    }
  }

  return { checked: r.rows.length, sent };
}
