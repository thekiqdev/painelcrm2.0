import { pool } from '../utils/db.js';
import { loadTicketForNotify, notifyTicketResolved } from './ticketNotificationsService.js';

/** Dias sem resposta do cliente antes de marcar como resolvido. */
export const TICKET_AUTO_RESOLVE_INACTIVE_DAYS = 7;

export type TicketAutoResolveCandidate = {
  status: string;
  last_customer_reply_at: string | Date | null;
};

export function isEligibleForAutoResolve(
  ticket: TicketAutoResolveCandidate,
  now: Date = new Date()
): boolean {
  if (ticket.status !== 'waiting_customer') return false;
  if (!ticket.last_customer_reply_at) return false;

  const last = new Date(ticket.last_customer_reply_at);
  if (Number.isNaN(last.getTime())) return false;

  const ms = TICKET_AUTO_RESOLVE_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - last.getTime() >= ms;
}

export type TicketAutoResolveRunResult = {
  resolved_count: number;
  ticket_ids: string[];
};

/**
 * Auto-resolve: waiting_customer + última resposta do cliente há mais de N dias.
 */
export async function runTicketAutoResolveBatch(): Promise<TicketAutoResolveRunResult> {
  const result = await pool.query<{ id: string }>(
    `UPDATE tickets t
     SET status = 'resolved'::ticket_status,
         updated_at = now()
     WHERE t.status = 'waiting_customer'::ticket_status
       AND t.last_customer_reply_at IS NOT NULL
       AND t.last_customer_reply_at < now() - ($1::int * interval '1 day')
     RETURNING t.id::text AS id`,
    [TICKET_AUTO_RESOLVE_INACTIVE_DAYS]
  );

  const ticket_ids = result.rows.map((r) => r.id);

  for (const ticketId of ticket_ids) {
    try {
      const tr = await pool.query<{ tenant_id: string }>(
        `SELECT u.tenant_id::text AS tenant_id
         FROM tickets t
         INNER JOIN users u ON u.id = t.user_id
         WHERE t.id = $1::uuid
         LIMIT 1`,
        [ticketId]
      );
      const tenantId = tr.rows[0]?.tenant_id;
      if (!tenantId) continue;
      const payload = await loadTicketForNotify(tenantId, ticketId);
      if (payload) await notifyTicketResolved(tenantId, payload);
    } catch (e) {
      console.warn('[ticketAutoResolve] notifyTicketResolved failed', ticketId, e);
    }
  }

  return { resolved_count: ticket_ids.length, ticket_ids };
}
