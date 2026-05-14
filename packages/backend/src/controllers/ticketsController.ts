import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { z } from 'zod';
import { notifyTenantTicketCreated } from '../services/ticketNotificationsService.js';

const ticketSchema = z.object({
  contact_name: z.string().min(1),
  contact_email: z.string().email(),
  contact_phone: z.string().optional().nullable(),
  subject: z.string().min(1),
  description: z.string().min(1),
  category_id: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z
    .enum(['new', 'open', 'pending', 'waiting_customer', 'in_progress', 'resolved', 'closed', 'cancelled'])
    .optional(),
  channel: z.enum(['portal', 'email', 'whatsapp', 'internal']).optional(),
  client_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.any().optional(),
});

function respondPerm(res: Response, error: unknown): boolean {
  if (error instanceof ModulePermissionError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
}

// Get tickets with filters
export async function getTickets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertModulePermission(userId, 'tickets', 'view', undefined, req);

    const { status, priority, category_id, search, client_id } = req.query;

    let query = `SELECT t.* FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE 1=1`;
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (client_id && typeof client_id === 'string') {
      const cid = client_id.trim();
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cid)
      ) {
        query += ` AND t.client_id = $${paramIndex}::uuid`;
        params.push(cid);
        paramIndex++;
      }
    }

    if (status && status !== 'all') {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority) {
      query += ` AND t.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (category_id) {
      query += ` AND t.category_id = $${paramIndex}`;
      params.push(category_id);
      paramIndex++;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      query += ` AND (t.subject ILIKE $${paramIndex} OR t.ticket_number ILIKE $${paramIndex} OR t.contact_name ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    if (respondPerm(res, error)) return;
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get ticket by ID
export async function getTicketById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const { id } = req.params;

    await assertModulePermission(userId, 'tickets', 'view', undefined, req);

    const result = await pool.query(
      `SELECT t.* FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.id = $2`,
      [tenantId, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (respondPerm(res, error)) return;
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create ticket
export async function createTicket(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const tenantId = req.tenantId ?? null;
  if (!tenantId) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  try {
    const ticketData = ticketSchema.parse(req.body);

    await assertModulePermission(userId, 'tickets', 'create', undefined, req);

    const channel = ticketData.channel ?? 'internal';
    const status = ticketData.status ?? 'new';

    const client = await pool.connect();
    let created: Record<string, unknown>;
    try {
      await client.query('BEGIN');

      const insert = await client.query(
        `INSERT INTO tickets (
          user_id, contact_name, contact_email, contact_phone,
          subject, description, category_id, priority, status, channel,
          client_id, team_id, assignee_id, tags, custom_fields
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
        RETURNING *`,
        [
          userId,
          ticketData.contact_name,
          ticketData.contact_email,
          ticketData.contact_phone || null,
          ticketData.subject,
          ticketData.description,
          ticketData.category_id || null,
          ticketData.priority || 'normal',
          status,
          channel,
          ticketData.client_id || null,
          ticketData.team_id || null,
          ticketData.assignee_id || null,
          ticketData.tags ? JSON.stringify(ticketData.tags) : '[]',
          ticketData.custom_fields ? JSON.stringify(ticketData.custom_fields) : '{}',
        ]
      );

      created = insert.rows[0] as Record<string, unknown>;
      const ticketId = String(created.id);

      await client.query(
        `INSERT INTO ticket_messages (
          ticket_id, user_id, content, visibility, attachments, mentions
        ) VALUES ($1, $2, $3, 'public', '[]'::jsonb, '[]'::jsonb)`,
        [ticketId, userId, ticketData.description.trim()]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    try {
      await notifyTenantTicketCreated(tenantId, {
        id: String(created.id),
        ticket_number: String(created.ticket_number),
        subject: String(created.subject),
        user_id: String(created.user_id),
        assignee_id: created.assignee_id ? String(created.assignee_id) : null,
        team_id: created.team_id ? String(created.team_id) : null,
      });
    } catch (e) {
      console.warn('[tickets] notifyTenantTicketCreated failed', e);
    }

    res.status(201).json(created);
  } catch (error) {
    if (respondPerm(res, error)) return;
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update ticket
export async function updateTicket(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const { id } = req.params;
    const ticketData = ticketSchema.partial().parse(req.body);

    const existing = await pool.query<{ user_id: string; assignee_id: string | null }>(
      `SELECT t.user_id, t.assignee_id FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.id = $2`,
      [tenantId, id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    const row = existing.rows[0];
    await assertModulePermission(userId, 'tickets', 'edit', {
      ownerId: row.user_id,
      assigneeId: row.assignee_id,
    }, req);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    Object.entries(ticketData).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'tags' || key === 'custom_fields') {
          updates.push(`${key} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const idParam = paramIndex;
    const tenantParam = paramIndex + 1;
    values.push(id, tenantId);
    const result = await pool.query(
      `UPDATE tickets t
       SET ${updates.join(', ')}, updated_at = now()
       WHERE t.id = $${idParam}
         AND EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id AND u.tenant_id = $${tenantParam})
       RETURNING t.*`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (respondPerm(res, error)) return;
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete ticket
export async function deleteTicket(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const { id } = req.params;

    const existing = await pool.query<{ user_id: string; assignee_id: string | null }>(
      `SELECT t.user_id, t.assignee_id FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.id = $2`,
      [tenantId, id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    const row = existing.rows[0];
    await assertModulePermission(userId, 'tickets', 'delete', {
      ownerId: row.user_id,
      assigneeId: row.assignee_id,
    }, req);

    const result = await pool.query(
      `DELETE FROM tickets t
       USING users u
       WHERE t.id = $1
         AND u.id = t.user_id
         AND u.tenant_id = $2
       RETURNING t.id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    if (respondPerm(res, error)) return;
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
