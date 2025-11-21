import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const stageSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  order_position: z.number().int().min(0).optional(),
});

// Create a new stage for a funnel
export async function createStage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { funnelId } = req.params;
    const stageData = stageSchema.parse(req.body);

    // Verify funnel belongs to user
    const funnelResult = await pool.query(
      'SELECT id FROM sales_funnels WHERE id = $1 AND user_id = $2',
      [funnelId, userId]
    );

    if (funnelResult.rows.length === 0) {
      res.status(404).json({ error: 'Funnel not found' });
      return;
    }

    // Get the current max order_position for this funnel
    const maxOrderResult = await pool.query(
      'SELECT COALESCE(MAX(order_position), -1) as max_order FROM funnel_stages WHERE funnel_id = $1',
      [funnelId]
    );
    const maxOrder = parseInt(maxOrderResult.rows[0].max_order, 10);
    const newOrderPosition = stageData.order_position !== undefined ? stageData.order_position : maxOrder + 1;

    const result = await pool.query(
      `INSERT INTO funnel_stages (
        user_id, funnel_id, name, color, order_position
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [userId, funnelId, stageData.name, stageData.color, newOrderPosition]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating stage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update a stage
export async function updateStage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const stageData = stageSchema.partial().parse(req.body);

    // Verify stage belongs to user
    const stageResult = await pool.query(
      `SELECT fs.id FROM funnel_stages fs
       INNER JOIN sales_funnels sf ON fs.funnel_id = sf.id
       WHERE fs.id = $1 AND sf.user_id = $2`,
      [id, userId]
    );

    if (stageResult.rows.length === 0) {
      res.status(404).json({ error: 'Stage not found' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(stageData).forEach(([key, value]) => {
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
      `UPDATE funnel_stages 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating stage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete a stage
export async function deleteStage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify stage belongs to user
    const stageResult = await pool.query(
      `SELECT fs.id FROM funnel_stages fs
       INNER JOIN sales_funnels sf ON fs.funnel_id = sf.id
       WHERE fs.id = $1 AND sf.user_id = $2`,
      [id, userId]
    );

    if (stageResult.rows.length === 0) {
      res.status(404).json({ error: 'Stage not found' });
      return;
    }

    const result = await pool.query(
      'DELETE FROM funnel_stages WHERE id = $1 RETURNING id',
      [id]
    );

    res.json({ message: 'Stage deleted successfully' });
  } catch (error) {
    console.error('Error deleting stage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

