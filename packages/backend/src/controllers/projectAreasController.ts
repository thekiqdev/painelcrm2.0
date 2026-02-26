import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

/** Tipos que permitem áreas: areas e advanced (fonte única de regra). */
const PROJECT_TYPES_WITH_AREAS = ['areas', 'advanced'] as const;

function projectAllowsAreas(projectType: string | null): boolean {
  return PROJECT_TYPES_WITH_AREAS.includes(projectType as any);
}

const areaSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  sort_order: z.number().int().min(0).optional().default(0),
  responsible_ids: z.array(z.string().uuid()).optional().default([]),
  team_ids: z.array(z.string().uuid()).optional().default([]),
});

// GET /api/projects/:projectId/areas
// Admin (dono do projeto) vê todas; demais só veem áreas em que estão em responsible_ids ou em alguma equipe de team_ids
export const getProjectAreas = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { projectId } = req.params;

    const projectCheck = await pool.query(
      `SELECT id, user_id, project_type FROM projects WHERE id = $1`,
      [projectId]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }
    const project = projectCheck.rows[0];
    if (!projectAllowsAreas(project.project_type)) {
      return res.status(400).json({ error: 'Este tipo de projeto não possui áreas' });
    }

    const isAdmin = project.user_id === userId;

    const result = await pool.query(
      `SELECT id, project_id, name, sort_order, responsible_ids, team_ids, created_at, updated_at
       FROM project_areas
       WHERE project_id = $1
       ORDER BY sort_order ASC, name ASC`,
      [projectId]
    );

    if (isAdmin) {
      return res.json(result.rows);
    }

    const userTeamIds = await pool.query(
      `SELECT team_id FROM team_members WHERE user_id = $1`,
      [userId]
    );
    const userTeamIdSet = new Set((userTeamIds.rows as { team_id: string }[]).map((r) => r.team_id));

    const filtered = result.rows.filter((row: any) => {
      const respIds: string[] = Array.isArray(row.responsible_ids) ? row.responsible_ids : [];
      if (respIds.includes(userId)) return true;
      const tids: string[] = Array.isArray(row.team_ids) ? row.team_ids : [];
      if (tids.some((tid: string) => userTeamIdSet.has(tid))) return true;
      return false;
    });

    res.json(filtered);
  } catch (error) {
    console.error('Error fetching project areas:', error);
    res.status(500).json({ error: 'Erro ao buscar áreas' });
  }
};

// POST /api/projects/:projectId/areas
export const createProjectArea = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { projectId } = req.params;

    const projectCheck = await pool.query(
      `SELECT id, project_type FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }
    if (!projectAllowsAreas(projectCheck.rows[0].project_type)) {
      return res.status(400).json({ error: 'Este tipo de projeto não permite criar áreas' });
    }

    const validated = areaSchema.parse(req.body);

    const maxOrder = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_areas WHERE project_id = $1`,
      [projectId]
    );
    const sortOrder = validated.sort_order ?? maxOrder.rows[0].next_order;

    const result = await pool.query(
      `INSERT INTO project_areas (project_id, name, sort_order, responsible_ids, team_ids)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING id, project_id, name, sort_order, responsible_ids, team_ids, created_at, updated_at`,
      [
        projectId,
        validated.name.trim(),
        sortOrder,
        JSON.stringify(validated.responsible_ids ?? []),
        JSON.stringify(validated.team_ids ?? []),
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating project area:', error);
    res.status(500).json({ error: 'Erro ao criar área' });
  }
};

// PATCH /api/projects/areas/:areaId
export const updateProjectArea = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { areaId } = req.params;

    const validated = areaSchema.partial().parse(req.body);
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(validated.name.trim());
    }
    if (validated.sort_order !== undefined) {
      updates.push(`sort_order = $${paramCount++}`);
      values.push(validated.sort_order);
    }
    if (validated.responsible_ids !== undefined) {
      updates.push(`responsible_ids = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.responsible_ids));
    }
    if (validated.team_ids !== undefined) {
      updates.push(`team_ids = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.team_ids));
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(userId, areaId);
    const result = await pool.query(
      `UPDATE project_areas
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount + 1}
         AND project_id IN (SELECT id FROM projects WHERE user_id = $${paramCount})
       RETURNING id, project_id, name, sort_order, responsible_ids, team_ids, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Área não encontrada' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating project area:', error);
    res.status(500).json({ error: 'Erro ao atualizar área' });
  }
};

// DELETE /api/projects/areas/:areaId
export const deleteProjectArea = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { areaId } = req.params;

    const result = await pool.query(
      `DELETE FROM project_areas pa
       USING projects p
       WHERE pa.project_id = p.id AND p.user_id = $1 AND pa.id = $2
       RETURNING pa.id`,
      [userId, areaId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Área não encontrada' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project area:', error);
    res.status(500).json({ error: 'Erro ao excluir área' });
  }
};
