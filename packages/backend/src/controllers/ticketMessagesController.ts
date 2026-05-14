import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { z } from 'zod';
import { notifyTenantTicketReplied } from '../services/ticketNotificationsService.js';

const messageSchema = z.object({
  content: z.string().min(1),
  visibility: z
    .enum(['public', 'internal', 'private'])
    .optional()
    .transform((v) => (v === 'private' ? 'internal' : v)),
  attachments: z.array(z.any()).optional(),
  mentions: z.array(z.string()).optional(),
});

function respondPerm(res: Response, error: unknown): boolean {
  if (error instanceof ModulePermissionError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
}

async function loadTicketInTenant(
  tenantId: string,
  ticketId: string
): Promise<{ user_id: string; assignee_id: string | null } | null> {
  const ticketResult = await pool.query<{ user_id: string; assignee_id: string | null }>(
    `SELECT t.user_id, t.assignee_id
     FROM tickets t
     INNER JOIN users creator ON creator.id = t.user_id AND creator.tenant_id = $1
     WHERE t.id = $2
     LIMIT 1`,
    [tenantId, ticketId]
  );
  return ticketResult.rows[0] ?? null;
}

// Get ticket messages
export async function getTicketMessages(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const { ticketId } = req.params;

    await assertModulePermission(userId, 'tickets', 'view', undefined, req);

    const ticket = await loadTicketInTenant(tenantId, ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const result = await pool.query(
      `SELECT tm.*, 
              json_build_object('id', u.id, 'email', u.email) as user
       FROM ticket_messages tm
       LEFT JOIN users u ON tm.user_id = u.id
       WHERE tm.ticket_id = $1
       ORDER BY tm.created_at ASC`,
      [ticketId]
    );

    res.json(result.rows);
  } catch (error) {
    if (respondPerm(res, error)) return;
    console.error('Error fetching ticket messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create ticket message
export async function createTicketMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const { ticketId } = req.params;
    const messageData = messageSchema.parse(req.body);

    const ticket = await loadTicketInTenant(tenantId, ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    await assertModulePermission(userId, 'tickets', 'edit', {
      ownerId: ticket.user_id,
      assigneeId: ticket.assignee_id,
    }, req);

    const result = await pool.query(
      `INSERT INTO ticket_messages (
        ticket_id, user_id, content, visibility, attachments, mentions
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      RETURNING *`,
      [
        ticketId,
        userId,
        messageData.content,
        messageData.visibility || 'public',
        JSON.stringify(messageData.attachments ?? []),
        JSON.stringify(messageData.mentions ?? []),
      ]
    );

    const row = result.rows[0];
    const full = await pool.query(
      `SELECT t.id, t.ticket_number, t.subject, t.user_id, t.assignee_id, t.team_id
       FROM tickets t
       INNER JOIN users creator ON creator.id = t.user_id AND creator.tenant_id = $1
       WHERE t.id = $2`,
      [tenantId, ticketId]
    );
    const trow = full.rows[0];
    if (trow) {
      try {
        await notifyTenantTicketReplied({
          tenantId,
          ticket: {
            id: String(trow.id),
            ticket_number: String(trow.ticket_number),
            subject: String(trow.subject),
            user_id: String(trow.user_id),
            assignee_id: trow.assignee_id ? String(trow.assignee_id) : null,
            team_id: trow.team_id ? String(trow.team_id) : null,
          },
          authorUserId: userId,
          preview: messageData.content,
        });
      } catch (e) {
        console.warn('[ticketMessages] notifyTenantTicketReplied failed', e);
      }
    }

    res.status(201).json(row);
  } catch (error) {
    if (respondPerm(res, error)) return;
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating ticket message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
