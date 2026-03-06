import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  color: z.string().optional(),
  default_team_id: z.string().uuid().optional().nullable(),
  custom_form: z.any().optional(),
});

// Get ticket categories
export async function getTicketCategories(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }

    const result = await pool.query(
      `SELECT tc.* FROM ticket_categories tc
       INNER JOIN users u ON u.id = tc.user_id AND u.tenant_id = $1
       ORDER BY tc.name`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching ticket categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create ticket category
export async function createTicketCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const categoryData = categorySchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO ticket_categories (
        user_id, name, description, color, default_team_id, custom_form
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        userId, categoryData.name, categoryData.description || null,
        categoryData.color || '#6E56CF', categoryData.default_team_id || null,
        categoryData.custom_form ? JSON.stringify(categoryData.custom_form) : '[]'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating ticket category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update ticket category
export async function updateTicketCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const categoryData = categorySchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(categoryData).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'custom_form') {
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

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE ticket_categories 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Ticket category not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating ticket category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete ticket category
export async function deleteTicketCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Check if category is used by any tickets (tenant-scoped)
    const ticketsResult = await pool.query(
      `SELECT COUNT(*) FROM tickets t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE t.category_id = $1`,
      [id, userId]
    );

    if (parseInt(ticketsResult.rows[0].count, 10) > 0) {
      res.status(409).json({ error: 'Cannot delete category with associated tickets' });
      return;
    }

    const result = await pool.query(
      `DELETE FROM ticket_categories WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2)) RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Ticket category not found' });
      return;
    }

    res.json({ message: 'Ticket category deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


