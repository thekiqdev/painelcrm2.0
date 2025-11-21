import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const leadStatusSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
});

export async function getLeadStatuses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      'SELECT * FROM lead_statuses WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lead statuses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createLeadStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const statusData = leadStatusSchema.parse(req.body);

    const result = await pool.query(
      'INSERT INTO lead_statuses (user_id, name, color) VALUES ($1, $2, $3) RETURNING *',
      [userId, statusData.name, statusData.color]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating lead status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateLeadStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const statusData = leadStatusSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (statusData.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(statusData.name);
    }
    if (statusData.color !== undefined) {
      updates.push(`color = $${paramCount++}`);
      values.push(statusData.color);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE lead_statuses SET ${updates.join(', ')}, updated_at = now() WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Status não encontrado' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating lead status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteLeadStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM lead_statuses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Status não encontrado' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting lead status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

