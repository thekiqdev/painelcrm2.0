import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const leadTaskSchema = z.object({
  lead_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  due_date: z.string().optional(),
});

export async function getLeadTasks(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { leadId } = req.params;

    const result = await pool.query(
      'SELECT * FROM lead_tasks WHERE lead_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [leadId, userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lead tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createLeadTask(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const taskData = leadTaskSchema.parse(req.body);

    // Verify lead belongs to user
    const leadCheck = await pool.query(
      'SELECT id FROM leads WHERE id = $1 AND user_id = $2',
      [taskData.lead_id, userId]
    );

    if (leadCheck.rows.length === 0) {
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

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE lead_tasks 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
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

    const result = await pool.query(
      'DELETE FROM lead_tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

