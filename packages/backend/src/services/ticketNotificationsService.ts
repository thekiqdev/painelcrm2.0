/**
 * Notificações in-app para tickets do tenant (não confundir com platform_support).
 */
import { pool } from '../utils/db.js';
import { createNotification, type NotificationType } from './notifications.js';

export interface TicketRowBrief {
  id: string;
  ticket_number: string;
  subject: string;
  user_id: string;
  assignee_id: string | null;
  team_id: string | null;
  priority?: string;
  client_name?: string | null;
  contact_name?: string | null;
}

export type TicketNotifyPayload = TicketRowBrief;

export type TicketReplyAuthor =
  | { role: 'customer'; userId?: string | null; preview: string; contactName?: string | null }
  | { role: 'support'; userId: string; preview: string };

export type TenantTicketCreatedNotifyMeta = {
  fromPublicPortal?: boolean;
  clientId?: string | null;
  clientName?: string | null;
  phoneMatchConflict?: boolean;
};

function ticketHref(ticketId: string): string {
  return `/support/tickets/${ticketId}`;
}

function resolveClientName(ticket: TicketNotifyPayload): string {
  return (
    ticket.client_name?.trim() ||
    ticket.contact_name?.trim() ||
    'Cliente'
  );
}

function buildTicketNotificationData(
  ticket: TicketNotifyPayload,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    subject: ticket.subject,
    client_name: resolveClientName(ticket),
    priority: ticket.priority ?? 'normal',
    route: ticketHref(ticket.id),
    href: ticketHref(ticket.id),
    ...extra,
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

async function teamMemberUserIds(tenantId: string, teamId: string | null): Promise<string[]> {
  if (!teamId) return [];
  const r = await pool.query<{ members: unknown }>(
    `SELECT tt.members
     FROM ticket_teams tt
     INNER JOIN users u ON u.id = tt.user_id AND u.tenant_id = $1
     WHERE tt.id = $2
     LIMIT 1`,
    [tenantId, teamId]
  );
  const m = r.rows[0]?.members;
  if (!Array.isArray(m)) return [];
  return m.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x.trim()));
}

async function fallbackTenantNotifyUserIds(tenantId: string, excludeUserId: string): Promise<string[]> {
  const adminR = await pool.query<{ id: string }>(
    `SELECT u.id
     FROM users u
     INNER JOIN user_profiles up ON up.owner_id = u.id
     WHERE u.tenant_id = $1
       AND u.id <> $2::uuid
       AND COALESCE(up.is_admin, false) = true`,
    [tenantId, excludeUserId]
  );
  if (adminR.rows.length > 0) return adminR.rows.map((x) => x.id);

  const anyR = await pool.query<{ id: string }>(
    `SELECT u.id
     FROM users u
     WHERE u.tenant_id = $1 AND u.id <> $2::uuid
     ORDER BY u.created_at ASC
     LIMIT 10`,
    [tenantId, excludeUserId]
  );
  return anyR.rows.map((x) => x.id);
}

/** Quem deve ser notificado ao abrir ticket (exclui o criador). */
export async function collectNewTicketNotifyUserIds(
  tenantId: string,
  ticket: TicketRowBrief
): Promise<string[]> {
  const out: string[] = [];
  if (ticket.assignee_id && ticket.assignee_id !== ticket.user_id) {
    out.push(ticket.assignee_id);
  }
  const teamIds = await teamMemberUserIds(tenantId, ticket.team_id);
  for (const uid of teamIds) {
    if (uid !== ticket.user_id) out.push(uid);
  }
  if (out.length === 0) {
    const fallback = await fallbackTenantNotifyUserIds(tenantId, ticket.user_id);
    return uniqueIds([ticket.user_id, ...fallback]);
  }
  return uniqueIds(out);
}

/** Envolvidos internos em respostas de suporte (exclui o autor). */
export async function collectInternalInvolvedUserIds(
  tenantId: string,
  ticket: TicketRowBrief,
  excludeUserId: string
): Promise<string[]> {
  const out: string[] = [];
  if (ticket.assignee_id && ticket.assignee_id !== excludeUserId) {
    out.push(ticket.assignee_id);
  }
  if (ticket.user_id && ticket.user_id !== excludeUserId) {
    out.push(ticket.user_id);
  }
  const teamIds = await teamMemberUserIds(tenantId, ticket.team_id);
  for (const uid of teamIds) {
    if (uid !== excludeUserId) out.push(uid);
  }
  if (out.length === 0) {
    return await fallbackTenantNotifyUserIds(tenantId, excludeUserId);
  }
  return uniqueIds(out);
}

/** Responsável na reabertura: assignee ou fallback equipe/admins. */
async function collectReopenNotifyUserIds(
  tenantId: string,
  ticket: TicketRowBrief
): Promise<string[]> {
  if (ticket.assignee_id) return [ticket.assignee_id];
  return collectNewTicketNotifyUserIds(tenantId, ticket);
}

function collectResolvedNotifyUserIds(ticket: TicketRowBrief): string[] {
  const out: string[] = [];
  if (ticket.assignee_id) out.push(ticket.assignee_id);
  if (ticket.user_id) out.push(ticket.user_id);
  return uniqueIds(out);
}

async function sendToMany(params: {
  userIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  logLabel: string;
}): Promise<void> {
  const message = params.message.slice(0, 250);
  console.log('[NOTIFY][TICKET]', {
    type: params.type,
    recipients: params.userIds.length,
    logLabel: params.logLabel,
    ticket_id: params.data.ticket_id,
  });
  for (const userId of params.userIds) {
    try {
      await createNotification({
        userId,
        type: params.type,
        title: params.title,
        message,
        data: params.data,
      });
    } catch (e) {
      console.warn(`[ticketNotifications] ${params.logLabel}`, userId, e);
    }
  }
}

/** Carrega metadados do ticket para notificações. */
export async function loadTicketForNotify(
  tenantId: string,
  ticketId: string
): Promise<TicketNotifyPayload | null> {
  const r = await pool.query<{
    id: string;
    ticket_number: string;
    subject: string;
    user_id: string;
    assignee_id: string | null;
    team_id: string | null;
    priority: string;
    contact_name: string;
    client_name: string | null;
  }>(
    `SELECT t.id::text,
            t.ticket_number,
            t.subject,
            t.user_id::text,
            t.assignee_id::text,
            t.team_id::text,
            t.priority::text,
            t.contact_name,
            CASE WHEN ucl.id IS NOT NULL THEN cl.name ELSE NULL END AS client_name
     FROM tickets t
     INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
     LEFT JOIN clients cl ON cl.id = t.client_id
     LEFT JOIN users ucl ON ucl.id = cl.user_id AND ucl.tenant_id = $1
     WHERE t.id = $2::uuid
     LIMIT 1`,
    [tenantId, ticketId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    ticket_number: row.ticket_number,
    subject: row.subject,
    user_id: row.user_id,
    assignee_id: row.assignee_id,
    team_id: row.team_id,
    priority: row.priority,
    contact_name: row.contact_name,
    client_name: row.client_name,
  };
}

/** Novo ticket: assignee → equipe → admins. */
export async function notifyTicketCreated(
  tenantId: string,
  ticket: TicketNotifyPayload,
  meta?: TenantTicketCreatedNotifyMeta
): Promise<void> {
  const recipients = await collectNewTicketNotifyUserIds(tenantId, ticket);
  const fromPortal = Boolean(meta?.fromPublicPortal);
  const title = fromPortal ? 'Novo ticket (Portal público)' : 'Novo ticket';
  let message = `${ticket.ticket_number}: ${ticket.subject}`;
  if (fromPortal) {
    const parts: string[] = [message];
    const cn = meta?.clientName?.trim() || resolveClientName(ticket);
    if (cn) parts.push(`Cliente: ${cn}`);
    if (meta?.phoneMatchConflict) parts.push('Telefone ambíguo (sem vínculo automático)');
    message = parts.join(' · ');
  }
  const data = buildTicketNotificationData(ticket, {
    ...(fromPortal
      ? {
          from_public_portal: true,
          ...(meta?.clientId ? { client_id: meta.clientId } : {}),
          ...(meta?.clientName ? { client_name: meta.clientName } : {}),
          ...(meta?.phoneMatchConflict ? { phone_match_conflict: true } : {}),
        }
      : {}),
  });
  await sendToMany({
    userIds: recipients,
    type: 'tenant_ticket_new',
    title,
    message,
    data,
    logLabel: 'notifyTicketCreated',
  });
}

/** Resposta: cliente → suporte; suporte → envolvidos internos. */
export async function notifyTicketReply(
  tenantId: string,
  ticket: TicketNotifyPayload,
  author: TicketReplyAuthor
): Promise<void> {
  const preview = author.preview.trim().slice(0, 200) || `Atualização em ${ticket.ticket_number}`;
  const data = buildTicketNotificationData(ticket);

  if (author.role === 'customer') {
    const exclude = author.userId?.trim() || null;
    const recipients = uniqueIds(
      (await collectNewTicketNotifyUserIds(tenantId, ticket)).filter((id) => !exclude || id !== exclude)
    );
    let message = preview;
    if (author.contactName?.trim()) {
      message = `${author.contactName.trim()}: ${message}`.slice(0, 250);
    }
    await sendToMany({
      userIds: recipients,
      type: 'tenant_ticket_public_reply',
      title: 'Resposta do cliente no ticket',
      message,
      data: { ...data, from_public_portal: true },
      logLabel: 'notifyTicketReply(customer)',
    });
    return;
  }

  const recipients = await collectInternalInvolvedUserIds(tenantId, ticket, author.userId);
  await sendToMany({
    userIds: recipients,
    type: 'tenant_ticket_reply',
    title: 'Nova resposta no ticket',
    message: preview,
    data,
    logLabel: 'notifyTicketReply(support)',
  });
}

/** Reabertura: notificar responsável (assignee ou fallback). */
export async function notifyTicketReopened(
  tenantId: string,
  ticket: TicketNotifyPayload
): Promise<void> {
  const recipients = await collectReopenNotifyUserIds(tenantId, ticket);
  const message = `${ticket.ticket_number}: ${ticket.subject}`.slice(0, 250);
  await sendToMany({
    userIds: recipients,
    type: 'tenant_ticket_reopened',
    title: 'Ticket reaberto',
    message,
    data: buildTicketNotificationData(ticket),
    logLabel: 'notifyTicketReopened',
  });
}

/** Resolução: criador e responsável. */
export async function notifyTicketResolved(
  tenantId: string,
  ticket: TicketNotifyPayload,
  excludeUserId?: string | null
): Promise<void> {
  void tenantId;
  let recipients = collectResolvedNotifyUserIds(ticket);
  if (excludeUserId) {
    recipients = recipients.filter((id) => id !== excludeUserId);
  }
  const message = `${ticket.ticket_number}: ${ticket.subject}`.slice(0, 250);
  await sendToMany({
    userIds: recipients,
    type: 'tenant_ticket_resolved',
    title: 'Ticket resolvido',
    message,
    data: buildTicketNotificationData(ticket),
    logLabel: 'notifyTicketResolved',
  });
}

export async function notifyTicketTransferred(
  tenantId: string,
  ticket: TicketNotifyPayload,
  options: {
    actorUserId?: string | null;
    previousAssigneeId?: string | null;
    previousTeamId?: string | null;
    newAssigneeId?: string | null;
    newTeamId?: string | null;
  }
): Promise<void> {
  const actor = options.actorUserId?.trim() || null;
  const previousAssignee = options.previousAssigneeId ?? null;
  const previousTeam = options.previousTeamId ?? null;
  const newAssignee = options.newAssigneeId ?? ticket.assignee_id ?? null;
  const newTeam = options.newTeamId ?? ticket.team_id ?? null;
  const assigneeChanged = newAssignee !== previousAssignee;
  const teamChanged = newTeam !== previousTeam;

  if (!assigneeChanged && !teamChanged) return;

  const recipients: string[] = [];
  if (assigneeChanged && newAssignee) recipients.push(newAssignee);
  if (teamChanged && newTeam) {
    recipients.push(...(await teamMemberUserIds(tenantId, newTeam)));
  }

  const userIds = uniqueIds(recipients).filter((id) => id !== actor);
  if (userIds.length === 0) return;

  await sendToMany({
    userIds,
    type: 'tenant_ticket_transferred',
    title: 'Ticket transferido',
    message: `${ticket.ticket_number}: ${ticket.subject}`.slice(0, 250),
    data: buildTicketNotificationData(ticket, {
      previous_assignee_id: previousAssignee,
      previous_team_id: previousTeam,
      new_assignee_id: newAssignee,
      new_team_id: newTeam,
    }),
    logLabel: 'notifyTicketTransferred',
  });
}

export async function notifyTicketSlaExpired(
  tenantId: string,
  ticket: TicketNotifyPayload
): Promise<void> {
  const recent = await pool.query<{ id: string }>(
    `SELECT id::text
     FROM notifications
     WHERE type = 'tenant_ticket_sla_expired'
       AND data->>'ticket_id' = $1
       AND created_at > now() - interval '24 hours'
     LIMIT 1`,
    [ticket.id]
  );
  if (recent.rows.length > 0) return;

  const recipients = await collectNewTicketNotifyUserIds(tenantId, ticket);
  await sendToMany({
    userIds: recipients,
    type: 'tenant_ticket_sla_expired',
    title: 'SLA de ticket expirado',
    message: `${ticket.ticket_number}: ${ticket.subject}`.slice(0, 250),
    data: buildTicketNotificationData(ticket, { sla_expired: true }),
    logLabel: 'notifyTicketSlaExpired',
  });
}

export async function notifyExpiredTicketSlasForTenant(tenantId: string): Promise<number> {
  const r = await pool.query<{ id: string }>(
    `SELECT t.id::text AS id
     FROM tickets t
     INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
     WHERE t.status IN ('new', 'open', 'pending', 'waiting_customer', 'in_progress')
       AND t.resolution_due_at IS NOT NULL
       AND t.resolution_due_at < now()
     ORDER BY t.resolution_due_at ASC
     LIMIT 50`,
    [tenantId]
  );
  let sent = 0;
  for (const row of r.rows) {
    const payload = await loadTicketForNotify(tenantId, row.id);
    if (!payload) continue;
    await notifyTicketSlaExpired(tenantId, payload);
    sent++;
  }
  return sent;
}

/** @deprecated Use notifyTicketCreated */
export const notifyTenantTicketCreated = notifyTicketCreated;

/** @deprecated Use notifyTicketReply */
export async function notifyTenantTicketReplied(params: {
  tenantId: string;
  ticket: TicketRowBrief;
  authorUserId: string;
  preview: string;
}): Promise<void> {
  await notifyTicketReply(params.tenantId, params.ticket, {
    role: 'support',
    userId: params.authorUserId,
    preview: params.preview,
  });
}

/** @deprecated Use notifyTicketReply */
export async function notifyTenantTicketPublicReply(params: {
  tenantId: string;
  ticket: TicketRowBrief;
  preview: string;
  contactName?: string | null;
}): Promise<void> {
  await notifyTicketReply(params.tenantId, params.ticket, {
    role: 'customer',
    preview: params.preview,
    contactName: params.contactName,
  });
}
