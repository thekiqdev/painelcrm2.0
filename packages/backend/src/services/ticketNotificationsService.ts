/**
 * Notificações in-app para tickets do tenant (não confundir com platform_support).
 */
import { pool } from '../utils/db.js';
import { createNotification } from './notifications.js';

export interface TicketRowBrief {
  id: string;
  ticket_number: string;
  subject: string;
  user_id: string;
  assignee_id: string | null;
  team_id: string | null;
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

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
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
    return await fallbackTenantNotifyUserIds(tenantId, ticket.user_id);
  }
  return uniqueIds(out);
}

export type TenantTicketCreatedNotifyMeta = {
  fromPublicPortal?: boolean;
  clientId?: string | null;
  clientName?: string | null;
  phoneMatchConflict?: boolean;
};

export async function notifyTenantTicketCreated(
  tenantId: string,
  ticket: TicketRowBrief,
  meta?: TenantTicketCreatedNotifyMeta
): Promise<void> {
  const recipients = await collectNewTicketNotifyUserIds(tenantId, ticket);
  const fromPortal = Boolean(meta?.fromPublicPortal);
  const title = fromPortal ? 'Novo ticket (Portal público)' : 'Novo ticket';
  let message = `${ticket.ticket_number}: ${ticket.subject}`;
  if (fromPortal) {
    const parts: string[] = [message];
    if (meta?.clientName) parts.push(`Cliente: ${meta.clientName}`);
    if (meta?.phoneMatchConflict) parts.push('Telefone ambíguo (sem vínculo automático)');
    message = parts.join(' · ');
  }
  message = message.slice(0, 250);
  const data: Record<string, unknown> = {
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    subject: ticket.subject,
    route: `/support/tickets/${ticket.id}`,
  };
  if (fromPortal) {
    data.from_public_portal = true;
    if (meta?.clientId) data.client_id = meta.clientId;
    if (meta?.clientName) data.client_name = meta.clientName;
    if (meta?.phoneMatchConflict) data.phone_match_conflict = true;
  }
  for (const userId of recipients) {
    try {
      await createNotification({
        userId,
        type: 'tenant_ticket_new',
        title,
        message,
        data,
      });
    } catch (e) {
      console.warn('[ticketNotifications] notifyTenantTicketCreated', userId, e);
    }
  }
}

/** Notifica criador e assignee quando alguém responde (exclui o autor da mensagem). */
export async function notifyTenantTicketReplied(params: {
  tenantId: string;
  ticket: TicketRowBrief;
  authorUserId: string;
  preview: string;
}): Promise<void> {
  const { tenantId, ticket, authorUserId, preview } = params;
  const recipients: string[] = [];
  if (ticket.user_id && ticket.user_id !== authorUserId) recipients.push(ticket.user_id);
  if (ticket.assignee_id && ticket.assignee_id !== authorUserId) recipients.push(ticket.assignee_id);
  const uniq = uniqueIds(recipients);
  const title = 'Nova resposta no ticket';
  const message = preview.trim().slice(0, 250) || `Atualização em ${ticket.ticket_number}`;
  const data = {
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    subject: ticket.subject,
    route: `/support/tickets/${ticket.id}`,
  };
  for (const userId of uniq) {
    try {
      await createNotification({
        userId,
        type: 'tenant_ticket_reply',
        title,
        message,
        data,
      });
    } catch (e) {
      console.warn('[ticketNotifications] notifyTenantTicketReplied', userId, e);
    }
  }
}
