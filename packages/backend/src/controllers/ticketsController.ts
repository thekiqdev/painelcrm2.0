import { Response } from 'express';
import { randomBytes } from 'crypto';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { z } from 'zod';
import {
  loadTicketForNotify,
  notifyTicketCreated,
  notifyExpiredTicketSlasForTenant,
  notifyTicketReopened,
  notifyTicketResolved,
  notifyTicketTransferred,
} from '../services/ticketNotificationsService.js';

const TICKET_ENTITY_AVATAR_SQL = `
       CASE WHEN ucl.id IS NOT NULL THEN COALESCE(cl.whatsapp_avatar_cached_url, cl.whatsapp_avatar_url) ELSE NULL END AS client_avatar,
       CASE WHEN uld.id IS NOT NULL THEN COALESCE(ld.whatsapp_avatar_cached_url, ld.whatsapp_avatar_url) ELSE NULL END AS lead_avatar`;

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
  lead_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.any().optional(),
});

function generateTicketPublicAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

function respondPerm(res: Response, error: unknown): boolean {
  if (error instanceof ModulePermissionError) {
    res.status(error.statusCode).json({ error: error.message });
    return true;
  }
  return false;
}

const OPEN_TICKET_STATUSES_SQL = `('new', 'open', 'pending', 'waiting_customer', 'in_progress')`;

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['resolve', 'assign', 'add_tag']),
  assignee_id: z.string().uuid().optional().nullable(),
  tag: z.string().min(1).max(80).optional(),
});

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
    void notifyExpiredTicketSlasForTenant(tenantId).catch((err) =>
      console.warn('[tickets] notifyExpiredTicketSlasForTenant failed', err)
    );

    const {
      status,
      priority,
      category_id,
      search,
      client_id,
      assignee_id,
      unassigned,
      no_response,
      my_queue,
      sla_overdue,
    } = req.query;

    let query = `SELECT t.*,
       CASE WHEN ucl.id IS NOT NULL THEN cl.name ELSE NULL END AS client_name,
       CASE WHEN uld.id IS NOT NULL THEN ld.name ELSE NULL END AS lead_name,
       ${TICKET_ENTITY_AVATAR_SQL},
       CASE
         WHEN last_msg.metadata IS NOT NULL AND last_msg.metadata->>'source' = 'public_portal'
         THEN 'customer'
         WHEN last_msg.id IS NOT NULL THEN 'support'
         ELSE NULL
       END AS last_message_author_role,
       last_msg.created_at AS last_message_at
       FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       LEFT JOIN clients cl ON cl.id = t.client_id
       LEFT JOIN users ucl ON ucl.id = cl.user_id AND ucl.tenant_id = $1
       LEFT JOIN leads ld ON ld.id = t.lead_id
       LEFT JOIN users uld ON uld.id = ld.user_id AND uld.tenant_id = $1
       LEFT JOIN LATERAL (
         SELECT tm.id, tm.metadata, tm.created_at
         FROM ticket_messages tm
         WHERE tm.ticket_id = t.id AND tm.visibility = 'public'
         ORDER BY tm.created_at DESC
         LIMIT 1
       ) last_msg ON true
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

    if (priority && typeof priority === 'string') {
      query += ` AND t.priority = $${paramIndex}::ticket_priority`;
      params.push(priority);
      paramIndex++;
    }

    if (unassigned === 'true' || unassigned === '1') {
      query += ' AND t.assignee_id IS NULL';
    }

    if (no_response === 'true' || no_response === '1') {
      query += ' AND t.first_response_at IS NULL';
    }

    if (sla_overdue === 'true' || sla_overdue === '1') {
      query += ' AND t.resolution_due_at IS NOT NULL AND t.resolution_due_at < now()';
    }

    if (my_queue === 'true' || my_queue === '1') {
      query += ` AND t.assignee_id = $${paramIndex}::uuid`;
      params.push(userId);
      paramIndex++;
      query += ` AND (t.first_response_at IS NULL OR t.status <> 'waiting_customer'::ticket_status)`;
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

    if (assignee_id === 'me') {
      query += ` AND t.assignee_id = $${paramIndex}::uuid`;
      params.push(userId);
      paramIndex++;
    } else if (assignee_id && typeof assignee_id === 'string') {
      const aid = assignee_id.trim();
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(aid)
      ) {
        query += ` AND t.assignee_id = $${paramIndex}::uuid`;
        params.push(aid);
        paramIndex++;
      }
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

export async function getTicketKanbanStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertModulePermission(userId, 'tickets', 'view', undefined, req);
    void notifyExpiredTicketSlasForTenant(tenantId).catch((err) =>
      console.warn('[tickets] notifyExpiredTicketSlasForTenant stats failed', err)
    );

    const result = await pool.query<{
      open_count: number;
      no_response_count: number;
      urgent_count: number;
      sla_overdue_count: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE t.status IN ${OPEN_TICKET_STATUSES_SQL})::int AS open_count,
         COUNT(*) FILTER (
           WHERE t.status IN ${OPEN_TICKET_STATUSES_SQL} AND t.first_response_at IS NULL
         )::int AS no_response_count,
         COUNT(*) FILTER (
           WHERE t.status IN ${OPEN_TICKET_STATUSES_SQL} AND t.priority = 'urgent'::ticket_priority
         )::int AS urgent_count,
         COUNT(*) FILTER (
           WHERE t.status IN ${OPEN_TICKET_STATUSES_SQL}
             AND t.resolution_due_at IS NOT NULL
             AND t.resolution_due_at < now()
         )::int AS sla_overdue_count
       FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1`,
      [tenantId]
    );

    res.json(result.rows[0] ?? {
      open_count: 0,
      no_response_count: 0,
      urgent_count: 0,
      sla_overdue_count: 0,
    });
  } catch (error) {
    if (respondPerm(res, error)) return;
    console.error('Error fetching ticket kanban stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getTicketMenuCount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    const userId = req.userId;
    if (!tenantId || !userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    await assertModulePermission(userId, 'tickets', 'view', undefined, req);

    const result = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM tickets t
       INNER JOIN users owner ON owner.id = t.user_id AND owner.tenant_id = $1
       LEFT JOIN ticket_teams tt ON tt.id = t.team_id
       WHERE t.status IN ('new', 'open')
         AND (
           t.user_id = $2::uuid
           OR
           t.assignee_id = $2::uuid
           OR (
             tt.members IS NOT NULL
             AND tt.members ? $2::text
           )
         )`,
      [tenantId, userId]
    );

    res.json({ count: Number(result.rows[0]?.count ?? 0) });
  } catch (error) {
    if (respondPerm(res, error)) return;
    console.error('Error fetching ticket menu count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function bulkUpdateTickets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const body = bulkUpdateSchema.parse(req.body);
    if (body.action === 'assign' && !body.assignee_id) {
      res.status(400).json({ error: 'assignee_id é obrigatório para atribuir' });
      return;
    }
    if (body.action === 'add_tag' && !body.tag?.trim()) {
      res.status(400).json({ error: 'tag é obrigatória' });
      return;
    }

    const existing = await pool.query<{
      id: string;
      user_id: string;
      assignee_id: string | null;
      team_id: string | null;
      status: string;
      tags: unknown;
    }>(
      `SELECT t.id::text, t.user_id::text, t.assignee_id::text, t.team_id::text, t.status::text, t.tags
       FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.id = ANY($2::uuid[])`,
      [tenantId, body.ids]
    );

    if (existing.rows.length !== body.ids.length) {
      res.status(400).json({ error: 'Um ou mais tickets não foram encontrados' });
      return;
    }

    for (const row of existing.rows) {
      if (row.status === 'closed') {
        res.status(403).json({ error: 'Tickets fechados não podem ser alterados em massa' });
        return;
      }
      await assertModulePermission(userId, 'tickets', 'edit', {
        ownerId: row.user_id,
        assigneeId: row.assignee_id,
      }, req);
    }

    const client = await pool.connect();
    let updated = 0;
    const assignedTicketIds: string[] = [];
    try {
      await client.query('BEGIN');

      const resolvedTicketIds: string[] = [];

      if (body.action === 'resolve') {
        const r = await client.query<{ id: string }>(
          `UPDATE tickets t
           SET status = 'resolved'::ticket_status, updated_at = now()
           FROM users u
           WHERE u.id = t.user_id AND u.tenant_id = $1
             AND t.id = ANY($2::uuid[])
             AND t.status <> 'closed'::ticket_status
           RETURNING t.id::text AS id`,
          [tenantId, body.ids]
        );
        updated = r.rowCount ?? 0;
        resolvedTicketIds.push(...r.rows.map((row) => row.id));
      } else if (body.action === 'assign') {
        const r = await client.query<{ id: string }>(
          `UPDATE tickets t
           SET assignee_id = $3::uuid, updated_at = now()
           FROM users u
           WHERE u.id = t.user_id AND u.tenant_id = $1
             AND t.id = ANY($2::uuid[])
             AND t.status <> 'closed'::ticket_status
           RETURNING t.id::text AS id`,
          [tenantId, body.ids, body.assignee_id]
        );
        updated = r.rowCount ?? 0;
        assignedTicketIds.push(...r.rows.map((row) => row.id));
      } else if (body.action === 'add_tag') {
        const tag = body.tag!.trim();
        for (const row of existing.rows) {
          if (row.status === 'closed') continue;
          let tags: string[] = [];
          if (Array.isArray(row.tags)) tags = row.tags.map(String);
          else if (typeof row.tags === 'string') {
            try {
              const p = JSON.parse(row.tags);
              if (Array.isArray(p)) tags = p.map(String);
            } catch {
              /* ignore */
            }
          }
          if (tags.includes(tag)) {
            updated++;
            continue;
          }
          await client.query(
            `UPDATE tickets SET tags = $2::jsonb, updated_at = now() WHERE id = $1::uuid`,
            [row.id, JSON.stringify([...tags, tag])]
          );
          updated++;
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    if (body.action === 'assign' && body.assignee_id) {
      const previousById = new Map(existing.rows.map((row) => [row.id, row]));
      for (const ticketId of assignedTicketIds) {
        const previous = previousById.get(ticketId);
        if (!previous || previous.assignee_id === body.assignee_id) continue;
        try {
          const payload = await loadTicketForNotify(tenantId, ticketId);
          if (payload) {
            await notifyTicketTransferred(tenantId, payload, {
              actorUserId: userId,
              previousAssigneeId: previous.assignee_id,
              previousTeamId: previous.team_id,
              newAssigneeId: body.assignee_id,
              newTeamId: payload.team_id,
            });
          }
        } catch (e) {
          console.warn('[tickets] bulk assign notification failed', ticketId, e);
        }
      }
    }

    res.json({ updated_count: updated, ids: body.ids });
  } catch (error) {
    if (respondPerm(res, error)) return;
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error bulk updating tickets:', error);
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
      `SELECT t.*,
        CASE WHEN ucl.id IS NOT NULL THEN cl.name ELSE NULL END AS client_name,
        CASE WHEN uld.id IS NOT NULL THEN ld.name ELSE NULL END AS lead_name,
        ${TICKET_ENTITY_AVATAR_SQL}
       FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       LEFT JOIN clients cl ON cl.id = t.client_id
       LEFT JOIN users ucl ON ucl.id = cl.user_id AND ucl.tenant_id = $1
       LEFT JOIN leads ld ON ld.id = t.lead_id
       LEFT JOIN users uld ON uld.id = ld.user_id AND uld.tenant_id = $1
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
    const publicAccessToken = generateTicketPublicAccessToken();

    const client = await pool.connect();
    let created: Record<string, unknown>;
    try {
      await client.query('BEGIN');

      const insert = await client.query(
        `INSERT INTO tickets (
          user_id, contact_name, contact_email, contact_phone,
          subject, description, category_id, priority, status, channel,
          client_id, lead_id, team_id, assignee_id, tags, custom_fields, public_access_token
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17)
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
          ticketData.lead_id || null,
          ticketData.team_id || null,
          ticketData.assignee_id || null,
          ticketData.tags ? JSON.stringify(ticketData.tags) : '[]',
          ticketData.custom_fields ? JSON.stringify(ticketData.custom_fields) : '{}',
          publicAccessToken,
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
      await notifyTicketCreated(tenantId, {
        id: String(created.id),
        ticket_number: String(created.ticket_number),
        subject: String(created.subject),
        user_id: String(created.user_id),
        assignee_id: created.assignee_id ? String(created.assignee_id) : null,
        team_id: created.team_id ? String(created.team_id) : null,
        priority: created.priority ? String(created.priority) : 'normal',
        contact_name: created.contact_name ? String(created.contact_name) : null,
      });
    } catch (e) {
      console.warn('[tickets] notifyTicketCreated failed', e);
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

// Get ticket activity log
export async function getTicketActivities(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const { id } = req.params;

    await assertModulePermission(userId, 'tickets', 'view', undefined, req);

    const ticketExists = await pool.query(
      `SELECT 1 FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
       WHERE t.id = $2`,
      [tenantId, id]
    );
    if (ticketExists.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const result = await pool.query(
      `SELECT ta.*,
              CASE WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'email', u.email) ELSE NULL END AS user
       FROM ticket_activities ta
       LEFT JOIN users u ON ta.user_id = u.id
       WHERE ta.ticket_id = $1
       ORDER BY ta.created_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    if (respondPerm(res, error)) return;
    console.error('Error fetching ticket activities:', error);
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

    const existing = await pool.query<{
      user_id: string;
      assignee_id: string | null;
      team_id: string | null;
      status: string;
    }>(
      `SELECT t.user_id, t.assignee_id, t.team_id, t.status::text AS status FROM tickets t
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

    if (row.status === 'closed') {
      res.status(403).json({ error: 'Tickets fechados não podem ser editados.' });
      return;
    }

    if (ticketData.status === 'open' && row.status === 'cancelled') {
      res.status(400).json({ error: 'Não é possível reabrir tickets cancelados.' });
      return;
    }

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

    const updated = result.rows[0] as { status?: string };
    const newStatus = ticketData.status ?? row.status;
    const statusChanged = ticketData.status !== undefined && newStatus !== row.status;
    const newAssigneeId =
      ticketData.assignee_id !== undefined ? ticketData.assignee_id ?? null : row.assignee_id;
    const newTeamId =
      ticketData.team_id !== undefined ? ticketData.team_id ?? null : row.team_id;
    const assignmentChanged =
      newAssigneeId !== row.assignee_id || newTeamId !== row.team_id;

    if (statusChanged || assignmentChanged) {
      try {
        const payload = await loadTicketForNotify(tenantId, id);
        if (payload) {
          if (row.status === 'resolved' && newStatus === 'open') {
            await notifyTicketReopened(tenantId, payload);
          } else if (newStatus === 'resolved' && row.status !== 'resolved') {
            await notifyTicketResolved(tenantId, payload, userId);
          }
          if (assignmentChanged) {
            await notifyTicketTransferred(tenantId, payload, {
              actorUserId: userId,
              previousAssigneeId: row.assignee_id,
              previousTeamId: row.team_id,
              newAssigneeId,
              newTeamId,
            });
          }
        }
      } catch (e) {
        console.warn('[tickets] notification failed', e);
      }
    }

    res.json(updated);
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
