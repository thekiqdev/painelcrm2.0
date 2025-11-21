import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const permissionSchema = z.object({
  permission: z.enum([
    'all_access',
    'manage_clients',
    'view_clients',
    'manage_leads',
    'view_leads',
    'manage_funnels',
    'view_funnels',
    'manage_settings',
    'view_reports',
    'manage_users',
  ]),
});

// GET /api/user-profiles/members/:memberId/permissions
export const getMemberPermissions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { memberId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Buscar informações do membro
    const memberResult = await pool.query(
      `SELECT pm.user_id, pm.profile_id
       FROM profile_members pm
       INNER JOIN user_profiles up ON pm.profile_id = up.id
       WHERE pm.id = $1 AND up.owner_id = $2`,
      [memberId, userId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    const member = memberResult.rows[0];

    // Buscar permissões
    const permissionsResult = await pool.query(
      `SELECT id, permission, created_at
       FROM user_permissions
       WHERE user_id = $1 AND profile_id = $2
       ORDER BY created_at DESC`,
      [member.user_id, member.profile_id]
    );

    res.json(permissionsResult.rows);
  } catch (error) {
    console.error('Error fetching member permissions:', error);
    res.status(500).json({ error: 'Erro ao buscar permissões' });
  }
};

// POST /api/user-profiles/members/:memberId/permissions
export const createMemberPermission = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { memberId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Buscar informações do membro
    const memberResult = await pool.query(
      `SELECT pm.user_id, pm.profile_id
       FROM profile_members pm
       INNER JOIN user_profiles up ON pm.profile_id = up.id
       WHERE pm.id = $1 AND up.owner_id = $2`,
      [memberId, userId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    const member = memberResult.rows[0];
    const validated = permissionSchema.parse(req.body);

    // Verificar se a permissão já existe
    const existingPermission = await pool.query(
      `SELECT id FROM user_permissions
       WHERE user_id = $1 AND profile_id = $2 AND permission = $3`,
      [member.user_id, member.profile_id, validated.permission]
    );

    if (existingPermission.rows.length > 0) {
      return res.status(400).json({ error: 'Permissão já existe' });
    }

    const result = await pool.query(
      `INSERT INTO user_permissions (user_id, profile_id, permission, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, profile_id, permission, created_at`,
      [member.user_id, member.profile_id, validated.permission, userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating member permission:', error);
    res.status(500).json({ error: 'Erro ao adicionar permissão' });
  }
};

// DELETE /api/user-profiles/members/:memberId/permissions/:permissionId
export const deleteMemberPermission = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { memberId, permissionId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Verificar se a permissão pertence ao membro e ao perfil do usuário
    const permissionCheck = await pool.query(
      `SELECT up.id
       FROM user_permissions up
       INNER JOIN profile_members pm ON up.user_id = pm.user_id AND up.profile_id = pm.profile_id
       INNER JOIN user_profiles uf ON pm.profile_id = uf.id
       WHERE up.id = $1 AND pm.id = $2 AND uf.owner_id = $3`,
      [permissionId, memberId, userId]
    );

    if (permissionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Permissão não encontrada' });
    }

    await pool.query(
      `DELETE FROM user_permissions WHERE id = $1`,
      [permissionId]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting member permission:', error);
    res.status(500).json({ error: 'Erro ao remover permissão' });
  }
};

