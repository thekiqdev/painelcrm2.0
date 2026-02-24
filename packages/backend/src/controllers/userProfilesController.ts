import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkTenantProfilesLimit } from '../services/tenantLimitService.js';
import { z } from 'zod';

const userProfileSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional().nullable(),
  is_admin: z.boolean().default(false),
});

// GET /api/user-profiles
export const getUserProfiles = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const result = await pool.query(
      `SELECT id, owner_id, name, description, is_admin, created_at, updated_at
       FROM user_profiles
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user profiles:', error);
    res.status(500).json({ error: 'Erro ao buscar perfis' });
  }
};

// GET /api/user-profiles/:id
export const getUserProfileById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, owner_id, name, description, is_admin, created_at, updated_at
       FROM user_profiles
       WHERE id = $1 AND owner_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
};

// POST /api/user-profiles
export const createUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = userProfileSchema.parse(req.body);

    const userRow = await pool.query('SELECT tenant_id FROM users WHERE id = $1', [userId]);
    const tenantId = userRow.rows[0]?.tenant_id;
    if (tenantId) {
      const limitCheck = await checkTenantProfilesLimit(tenantId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          error: `Limite de perfis do plano atingido (${limitCheck.current}/${limitCheck.limit}).`,
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO user_profiles (owner_id, name, description, is_admin)
       VALUES ($1, $2, $3, $4)
       RETURNING id, owner_id, name, description, is_admin, created_at, updated_at`,
      [userId, validated.name, validated.description || null, validated.is_admin]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating user profile:', error);
    res.status(500).json({ error: 'Erro ao criar perfil' });
  }
};

// PATCH /api/user-profiles/:id
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const validated = userProfileSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(validated.name);
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(validated.description || null);
    }
    if (validated.is_admin !== undefined) {
      updates.push(`is_admin = $${paramCount++}`);
      values.push(validated.is_admin);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE user_profiles
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND owner_id = $${paramCount + 1}
       RETURNING id, owner_id, name, description, is_admin, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
};

// DELETE /api/user-profiles/:id
export const deleteUserProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM user_profiles
       WHERE id = $1 AND owner_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user profile:', error);
    res.status(500).json({ error: 'Erro ao deletar perfil' });
  }
};

