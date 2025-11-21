import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const profileMemberSchema = z.object({
  user_id: z.string().uuid('user_id deve ser um UUID válido'),
});

// GET /api/user-profiles/:profileId/members
export const getProfileMembers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Verificar se o perfil pertence ao usuário
    const profileCheck = await pool.query(
      `SELECT id FROM user_profiles WHERE id = $1 AND owner_id = $2`,
      [profileId, userId]
    );

    if (profileCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    const result = await pool.query(
      `SELECT pm.id, pm.profile_id, pm.user_id, pm.created_by, pm.created_at, pm.updated_at,
              u.email
       FROM profile_members pm
       LEFT JOIN users u ON pm.user_id = u.id
       WHERE pm.profile_id = $1
       ORDER BY pm.created_at DESC`,
      [profileId]
    );

    // Buscar permissões de cada membro
    const membersWithPermissions = await Promise.all(
      result.rows.map(async (member) => {
        const permissionsResult = await pool.query(
          `SELECT permission FROM user_permissions
           WHERE user_id = $1 AND profile_id = $2`,
          [member.user_id, profileId]
        );

        return {
          ...member,
          permissions: permissionsResult.rows.map((p: any) => p.permission),
        };
      })
    );

    res.json(membersWithPermissions);
  } catch (error) {
    console.error('Error fetching profile members:', error);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
};

// POST /api/user-profiles/:profileId/members
export const createProfileMember = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Verificar se o perfil pertence ao usuário
    const profileCheck = await pool.query(
      `SELECT id FROM user_profiles WHERE id = $1 AND owner_id = $2`,
      [profileId, userId]
    );

    if (profileCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    const validated = profileMemberSchema.parse(req.body);

    // Verificar se o membro já existe
    const existingMember = await pool.query(
      `SELECT id FROM profile_members WHERE profile_id = $1 AND user_id = $2`,
      [profileId, validated.user_id]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'Usuário já é membro deste perfil' });
    }

    const result = await pool.query(
      `INSERT INTO profile_members (profile_id, user_id, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, profile_id, user_id, created_by, created_at, updated_at`,
      [profileId, validated.user_id, userId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating profile member:', error);
    res.status(500).json({ error: 'Erro ao adicionar membro' });
  }
};

// DELETE /api/user-profiles/members/:memberId
export const deleteProfileMember = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { memberId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Verificar se o membro pertence a um perfil do usuário
    const memberCheck = await pool.query(
      `SELECT pm.id, pm.profile_id
       FROM profile_members pm
       INNER JOIN user_profiles up ON pm.profile_id = up.id
       WHERE pm.id = $1 AND up.owner_id = $2`,
      [memberId, userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    // Deletar permissões do membro primeiro
    await pool.query(
      `DELETE FROM user_permissions
       WHERE user_id = (SELECT user_id FROM profile_members WHERE id = $1)
       AND profile_id = (SELECT profile_id FROM profile_members WHERE id = $1)`,
      [memberId]
    );

    // Deletar o membro
    await pool.query(
      `DELETE FROM profile_members WHERE id = $1`,
      [memberId]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting profile member:', error);
    res.status(500).json({ error: 'Erro ao remover membro' });
  }
};

