import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const createFeatureSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/, 'key: apenas minúsculas, números e underscore'),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  sort_order: z.number().int().optional().default(0),
});

const updateFeatureSchema = createFeatureSchema.partial();

/**
 * GET /api/superadmin/features - Lista recursos do sistema (system_features)
 */
export async function listSystemFeatures(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT id, key, name, description, sort_order, created_at, updated_at FROM system_features ORDER BY sort_order, key'
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('listSystemFeatures error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * GET /api/superadmin/features/:id
 */
export async function getSystemFeature(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, key, name, description, sort_order, created_at, updated_at FROM system_features WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Recurso não encontrado' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('getSystemFeature error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * POST /api/superadmin/features
 */
export async function createSystemFeature(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = createFeatureSchema.parse(req.body);
    const existing = await pool.query('SELECT id FROM system_features WHERE key = $1', [body.key]);
    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Já existe um recurso com esta key.' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO system_features (key, name, description, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, key, name, description, sort_order, created_at, updated_at`,
      [body.key, body.name, body.description ?? null, body.sort_order]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('createSystemFeature error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/superadmin/features/:id
 */
export async function updateSystemFeature(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = updateFeatureSchema.parse(req.body);
    const existing = await pool.query('SELECT id FROM system_features WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Recurso não encontrado' });
      return;
    }
    if (body.key !== undefined) {
      const dup = await pool.query('SELECT id FROM system_features WHERE key = $1 AND id != $2', [body.key, id]);
      if (dup.rows.length > 0) {
        res.status(400).json({ error: 'Já existe outro recurso com esta key.' });
        return;
      }
    }
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    (['key', 'name', 'description', 'sort_order'] as const).forEach((field) => {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${i++}`);
        values.push(body[field]);
      }
    });
    if (updates.length === 0) {
      const r = await pool.query('SELECT id, key, name, description, sort_order, created_at, updated_at FROM system_features WHERE id = $1', [id]);
      res.json(r.rows[0]);
      return;
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE system_features SET ${updates.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING id, key, name, description, sort_order, created_at, updated_at`,
      values
    );
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('updateSystemFeature error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /api/superadmin/features/:id
 */
export async function deleteSystemFeature(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM system_features WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Recurso não encontrado' });
      return;
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('deleteSystemFeature error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
