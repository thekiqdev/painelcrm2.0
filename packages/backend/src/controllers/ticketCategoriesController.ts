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

    const tenantRes = await pool.query<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM users WHERE id = $1::uuid LIMIT 1`,
      [userId]
    );
    const tenantId = tenantRes.rows[0]?.tenant_id;
    if (!tenantId) {
      res.status(403).json({ error: 'Tenant não encontrado' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const exists = await client.query(
        `SELECT tc.id FROM ticket_categories tc
         INNER JOIN users u ON u.id = tc.user_id AND u.tenant_id = $1::uuid
         WHERE tc.id = $2::uuid
         LIMIT 1`,
        [tenantId, id]
      );
      if (exists.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Categoria não encontrada' });
        return;
      }

      // Desvincula tickets do tenant que usam a categoria
      await client.query(
        `UPDATE tickets t
         SET category_id = NULL, updated_at = now()
         FROM users u
         WHERE t.user_id = u.id
           AND u.tenant_id = $1::uuid
           AND t.category_id = $2::uuid`,
        [tenantId, id]
      );

      // Remove da lista do portal público, se estiver marcada
      await client.query(
        `UPDATE tenant_support_portal_settings
         SET allowed_category_ids = (
           SELECT CASE
             WHEN allowed_category_ids IS NULL THEN NULL
             ELSE COALESCE(
               (SELECT array_agg(x) FROM unnest(allowed_category_ids) AS x WHERE x <> $2::uuid),
               '{}'::uuid[]
             )
           END
         ),
         updated_at = now()
         WHERE tenant_id = $1::uuid
           AND allowed_category_ids IS NOT NULL
           AND $2::uuid = ANY(allowed_category_ids)`,
        [tenantId, id]
      );

      const result = await client.query(
        `DELETE FROM ticket_categories tc
         USING users u
         WHERE tc.id = $2::uuid
           AND tc.user_id = u.id
           AND u.tenant_id = $1::uuid
         RETURNING tc.id`,
        [tenantId, id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Categoria não encontrada' });
        return;
      }

      await client.query('COMMIT');
      res.json({ message: 'Categoria excluída' });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting ticket category:', error);
    res.status(500).json({ error: 'Erro ao excluir categoria' });
  }
}


