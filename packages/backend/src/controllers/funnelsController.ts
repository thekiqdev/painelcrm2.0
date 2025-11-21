import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const funnelSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1),
  source: z.string().optional(),
  is_default: z.boolean().optional(),
  profile_id: z.string().uuid().optional(),
});

export async function getFunnels(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { profileId } = req.query;

    let query = 'SELECT * FROM sales_funnels WHERE user_id = $1';
    const params: any[] = [userId];

    if (profileId) {
      query += ' AND profile_id = $2';
      params.push(profileId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching funnels:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getFunnelById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Get funnel with stages
    const funnelResult = await pool.query(
      'SELECT * FROM sales_funnels WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (funnelResult.rows.length === 0) {
      res.status(404).json({ error: 'Funnel not found' });
      return;
    }

    const funnel = funnelResult.rows[0];

    // Get stages
    const stagesResult = await pool.query(
      'SELECT * FROM funnel_stages WHERE funnel_id = $1 ORDER BY order_position',
      [id]
    );

    res.json({
      ...funnel,
      stages: stagesResult.rows,
    });
  } catch (error) {
    console.error('Error fetching funnel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

const stageSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  order_position: z.number().int().min(0),
});

export async function createFunnel(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const body = req.body;
    const funnelData = funnelSchema.parse(body);

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Create the funnel
      const funnelResult = await pool.query(
        `INSERT INTO sales_funnels (
          user_id, name, description, type, source, is_default, profile_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          userId, funnelData.name, funnelData.description, funnelData.type,
          funnelData.source, funnelData.is_default || false, funnelData.profile_id
        ]
      );

      const newFunnel = funnelResult.rows[0];

      // Create stages if provided
      if (body.stages && Array.isArray(body.stages) && body.stages.length > 0) {
        const stages = body.stages.map((stage: any) => stageSchema.parse(stage));
        
        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];
          // Use provided order_position or use index as fallback
          const orderPosition = stage.order_position !== undefined ? stage.order_position : i;
          
          await pool.query(
            `INSERT INTO funnel_stages (
              user_id, funnel_id, name, color, order_position
            ) VALUES ($1, $2, $3, $4, $5)`,
            [userId, newFunnel.id, stage.name, stage.color, orderPosition]
          );
        }
      }

      // Commit transaction
      await pool.query('COMMIT');

      // Fetch the complete funnel with stages
      const stagesResult = await pool.query(
        'SELECT * FROM funnel_stages WHERE funnel_id = $1 ORDER BY order_position',
        [newFunnel.id]
      );

      res.status(201).json({
        ...newFunnel,
        stages: stagesResult.rows,
      });
    } catch (error) {
      // Rollback on error
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating funnel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateFunnel(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const funnelData = funnelSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(funnelData).forEach(([key, value]) => {
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
      `UPDATE sales_funnels 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Funnel not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating funnel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteFunnel(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM sales_funnels WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Funnel not found' });
      return;
    }

    res.json({ message: 'Funnel deleted successfully' });
  } catch (error) {
    console.error('Error deleting funnel:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

