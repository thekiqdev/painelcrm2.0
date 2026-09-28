import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const commentBodySchema = z.object({ body: z.string().min(1, 'Comentário não pode ser vazio') });

/** Verifica se o usuário pode acessar a área (dono do projeto OU está em responsible_ids OU em alguma equipe de team_ids). */
async function userCanAccessArea(userId: string, areaId: string): Promise<{ ok: boolean; isAdmin?: boolean }> {
  const areaRow = await pool.query(
    `SELECT pa.id, pa.responsible_ids, pa.team_ids, p.user_id AS project_owner_id
     FROM project_areas pa
     INNER JOIN projects p ON p.id = pa.project_id
     WHERE pa.id = $1`,
    [areaId]
  );
  if (areaRow.rows.length === 0) return { ok: false };
  const row = areaRow.rows[0];
  if (row.project_owner_id === userId) return { ok: true, isAdmin: true };
  const respIds: string[] = Array.isArray(row.responsible_ids) ? row.responsible_ids : [];
  if (respIds.includes(userId)) return { ok: true };
  const teamIds: string[] = Array.isArray(row.team_ids) ? row.team_ids : [];
  if (teamIds.length > 0) {
    const member = await pool.query(
      `SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = ANY($2::uuid[]) LIMIT 1`,
      [userId, teamIds]
    );
    if (member.rows.length > 0) return { ok: true };
  }
  return { ok: false };
}

// GET /api/projects/:projectId/areas/:areaId/comments
export const getAreaComments = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { projectId, areaId } = req.params;

    const access = await userCanAccessArea(userId, areaId);
    if (!access.ok) {
      return res.status(403).json({ error: 'Sem permissão para visualizar esta área' });
    }

    const result = await pool.query(
      `SELECT c.id, c.area_id, c.user_id, c.body, c.created_at, c.deleted_at,
              u.email,
              TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS author_name
       FROM project_area_comments c
       INNER JOIN users u ON u.id = c.user_id
       LEFT JOIN profiles p ON p.id = u.id
       WHERE c.area_id = $1
       ORDER BY c.created_at ASC`,
      [areaId]
    );

    const comments = result.rows.map((r: any) => ({
      id: r.id,
      area_id: r.area_id,
      user_id: r.user_id,
      body: r.deleted_at ? null : r.body,
      deleted_at: r.deleted_at,
      created_at: r.created_at,
      author_name: (r.author_name && String(r.author_name).trim()) || r.email || 'Usuário',
      author_email: r.email,
    }));

    res.json(comments);
  } catch (error) {
    console.error('Error fetching area comments:', error);
    res.status(500).json({ error: 'Erro ao buscar comentários' });
  }
};

// POST /api/projects/:projectId/areas/:areaId/comments
export const createAreaComment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { projectId, areaId } = req.params;

    const access = await userCanAccessArea(userId, areaId);
    if (!access.ok) {
      return res.status(403).json({ error: 'Sem permissão para comentar nesta área' });
    }

    const { body } = commentBodySchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO project_area_comments (area_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, area_id, user_id, body, created_at, deleted_at`,
      [areaId, userId, body.trim()]
    );
    const row = result.rows[0];

    const userRow = await pool.query(
      `SELECT u.email, TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS author_name
       FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = $1`,
      [userId]
    );
    const u = userRow.rows[0] || {};
    const authorName = (u.author_name && String(u.author_name).trim()) || u.email || 'Usuário';

    res.status(201).json({
      id: row.id,
      area_id: row.area_id,
      user_id: row.user_id,
      body: row.body,
      created_at: row.created_at,
      deleted_at: row.deleted_at,
      author_name: authorName,
      author_email: u.email,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating area comment:', error);
    res.status(500).json({ error: 'Erro ao criar comentário' });
  }
};

// DELETE /api/projects/:projectId/areas/:areaId/comments/:commentId (soft delete; só autor)
export const deleteAreaComment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { projectId, areaId, commentId } = req.params;

    const access = await userCanAccessArea(userId, areaId);
    if (!access.ok) {
      return res.status(403).json({ error: 'Sem permissão nesta área' });
    }

    const check = await pool.query(
      `SELECT id, user_id FROM project_area_comments WHERE id = $1 AND area_id = $2`,
      [commentId, areaId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Comentário não encontrado' });
    }
    if (check.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Só o autor pode excluir o comentário' });
    }

    await pool.query(
      `UPDATE project_area_comments SET deleted_at = now() WHERE id = $1`,
      [commentId]
    );
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting area comment:', error);
    res.status(500).json({ error: 'Erro ao excluir comentário' });
  }
};
