import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';
const taskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  due_time: z.string().optional().nullable(),
  status: z.enum(['pending', 'completed']).default('pending'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  client_id: z.string().uuid().optional().nullable(),
  client_name: z.string().optional().nullable(),
  deal: z.string().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  assignee_name: z.string().optional().nullable(),
  checklist: z.array(z.object({
    id: z.string(),
    text: z.string(),
    completed: z.boolean()
  })).default([]),
});

// GET /api/tasks
export const getTasks = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId ?? null;
    if (!tenantId) {
      return res.json([]);
    }
    const { status, date, clientId } = req.query;

    let query = `
      SELECT t.id, t.title, t.description, t.due_date, t.due_time, t.status, t.priority,
             t.client_id, t.client_name, t.deal, t.assignee_id, t.assignee_name,
             t.checklist, t.created_at, t.updated_at
      FROM tasks t
      INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
      WHERE 1=1
    `;
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
    }

    if (date) {
      paramCount++;
      query += ` AND t.due_date = $${paramCount}`;
      params.push(date);
    }

    if (clientId) {
      paramCount++;
      query += ` AND t.client_id = $${paramCount}`;
      params.push(clientId);
    }

    query += ` ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`;

    const result = await pool.query(query, params);

    const tasks = result.rows.map(task => ({
      ...task,
      checklist: Array.isArray(task.checklist) ? task.checklist : [],
      date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : null,
      time: task.due_time || null,
      client: task.client_name || null,
      assignee: task.assignee_name || null,
      assigneeAvatar: task.assignee_name ? task.assignee_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : null,
    }));

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefas' });
  }
};

// GET /api/tasks/:id
export const getTaskById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT t.id, t.title, t.description, t.due_date, t.due_time, t.status, t.priority,
              t.client_id, t.client_name, t.deal, t.assignee_id, t.assignee_name,
              t.checklist, t.created_at, t.updated_at
       FROM tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE t.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const task = {
      ...result.rows[0],
      checklist: Array.isArray(result.rows[0].checklist) ? result.rows[0].checklist : [],
      date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString().split('T')[0] : null,
      time: result.rows[0].due_time || null,
      client: result.rows[0].client_name || null,
      assignee: result.rows[0].assignee_name || null,
      assigneeAvatar: result.rows[0].assignee_name ? result.rows[0].assignee_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : null,
    };

    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefa' });
  }
};

// POST /api/tasks
export const createTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = taskSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO tasks (
        user_id, title, description, due_date, due_time, status, priority,
        client_id, client_name, deal, assignee_id, assignee_name, checklist
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING id, title, description, due_date, due_time, status, priority,
                client_id, client_name, deal, assignee_id, assignee_name,
                checklist, created_at, updated_at`,
      [
        userId,
        validated.title,
        validated.description || null,
        validated.due_date || null,
        validated.due_time || null,
        validated.status,
        validated.priority,
        validated.client_id || null,
        validated.client_name || null,
        validated.deal || null,
        validated.assignee_id || null,
        validated.assignee_name || null,
        JSON.stringify(validated.checklist || []),
      ]
    );

    const task = {
      ...result.rows[0],
      checklist: Array.isArray(result.rows[0].checklist) ? result.rows[0].checklist : [],
      date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString().split('T')[0] : null,
      time: result.rows[0].due_time || null,
      client: result.rows[0].client_name || null,
      assignee: result.rows[0].assignee_name || null,
      assigneeAvatar: result.rows[0].assignee_name ? result.rows[0].assignee_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : null,
    };

    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
};

// PATCH /api/tasks/:id
export const updateTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const validated = taskSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (validated.title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(validated.title);
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(validated.description || null);
    }
    if (validated.due_date !== undefined) {
      updates.push(`due_date = $${paramCount++}`);
      values.push(validated.due_date || null);
    }
    if (validated.due_time !== undefined) {
      updates.push(`due_time = $${paramCount++}`);
      values.push(validated.due_time || null);
    }
    if (validated.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(validated.status);
    }
    if (validated.priority !== undefined) {
      updates.push(`priority = $${paramCount++}`);
      values.push(validated.priority);
    }
    if (validated.client_id !== undefined) {
      updates.push(`client_id = $${paramCount++}`);
      values.push(validated.client_id || null);
    }
    if (validated.client_name !== undefined) {
      updates.push(`client_name = $${paramCount++}`);
      values.push(validated.client_name || null);
    }
    if (validated.deal !== undefined) {
      updates.push(`deal = $${paramCount++}`);
      values.push(validated.deal || null);
    }
    if (validated.assignee_id !== undefined) {
      updates.push(`assignee_id = $${paramCount++}`);
      values.push(validated.assignee_id || null);
    }
    if (validated.assignee_name !== undefined) {
      updates.push(`assignee_name = $${paramCount++}`);
      values.push(validated.assignee_name || null);
    }
    if (validated.checklist !== undefined) {
      updates.push(`checklist = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.checklist));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE tasks
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramCount + 1}))
       RETURNING id, title, description, due_date, due_time, status, priority,
                 client_id, client_name, deal, assignee_id, assignee_name,
                 checklist, created_at, updated_at`,
      [...values, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const task = {
      ...result.rows[0],
      checklist: Array.isArray(result.rows[0].checklist) ? result.rows[0].checklist : [],
      date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString().split('T')[0] : null,
      time: result.rows[0].due_time || null,
      client: result.rows[0].client_name || null,
      assignee: result.rows[0].assignee_name || null,
      assigneeAvatar: result.rows[0].assignee_name ? result.rows[0].assignee_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : null,
    };

    res.json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
};

// DELETE /api/tasks/:id
export const deleteTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Erro ao deletar tarefa' });
  }
};

