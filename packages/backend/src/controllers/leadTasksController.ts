import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { assertModulePermission, assertPermissionKey, ModulePermissionError } from '../permissions/index.js';

const leadTaskSchema = z.object({
  lead_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  due_date: z.string().optional(),
});

async function leadBelongsToTenant(leadId: string, tenantId: string | null): Promise<boolean> {
  if (!tenantId) return false;
  const r = await pool.query(
    `SELECT 1 FROM leads l
     INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
     WHERE l.id = $2`,
    [tenantId, leadId]
  );
  return r.rows.length > 0;
}

export async function getLeadTasks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { leadId } = req.params;

    const ok = await leadBelongsToTenant(leadId, req.tenantId ?? null);
    if (!ok) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    try {
      await assertPermissionKey(userId, 'tasks.view', req);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      throw e;
    }

    const result = await pool.query(
      'SELECT * FROM lead_tasks WHERE lead_id = $1 ORDER BY created_at DESC',
      [leadId]
    );

    res.json(result.rows);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error fetching lead tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createLeadTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    try {
      await assertPermissionKey(userId, 'tasks.create', req);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      throw e;
    }
    const taskData = leadTaskSchema.parse(req.body);

    const ok = await leadBelongsToTenant(taskData.lead_id, req.tenantId ?? null);
    if (!ok) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO lead_tasks (user_id, lead_id, title, description, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId, taskData.lead_id, taskData.title,
        taskData.description, taskData.status, taskData.due_date
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating lead task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateLeadTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const taskData = leadTaskSchema.partial().omit({ lead_id: true }).parse(req.body);

    const taskRow = await pool.query<{ lead_id: string; user_id: string }>(
      'SELECT lead_id, user_id FROM lead_tasks WHERE id = $1',
      [id]
    );
    if (taskRow.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const ok = await leadBelongsToTenant(taskRow.rows[0].lead_id, req.tenantId ?? null);
    if (!ok) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    try {
      await assertModulePermission(
        userId,
        'tasks',
        'edit',
        { ownerId: taskRow.rows[0].user_id },
        req
      );
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      throw e;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(taskData).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE lead_tasks 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex}
         AND lead_id IN (SELECT l.id FROM leads l INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      [...values, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating lead task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteLeadTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const taskRow = await pool.query<{ lead_id: string; user_id: string }>(
      'SELECT lead_id, user_id FROM lead_tasks WHERE id = $1',
      [id]
    );
    if (taskRow.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const ok = await leadBelongsToTenant(taskRow.rows[0].lead_id, req.tenantId ?? null);
    if (!ok) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    try {
      await assertModulePermission(
        userId,
        'tasks',
        'delete',
        { ownerId: taskRow.rows[0].user_id },
        req
      );
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        res.status(e.statusCode).json({ error: e.message });
        return;
      }
      throw e;
    }

    const result = await pool.query(
      `DELETE FROM lead_tasks WHERE id = $1
       AND lead_id IN (SELECT l.id FROM leads l INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting lead task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

