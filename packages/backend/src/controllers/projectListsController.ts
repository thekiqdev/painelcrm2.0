import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const listSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  order_position: z.number().int().min(0).default(0),
});

// GET /api/projects/:projectId/lists
export const getProjectLists = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { projectId } = req.params;

    // Verificar se o projeto pertence ao usuário
    const projectCheck = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const result = await pool.query(
      `SELECT id, project_id, name, order_position, created_at, updated_at
       FROM project_lists
       WHERE project_id = $1
       ORDER BY order_position ASC`,
      [projectId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching project lists:', error);
    res.status(500).json({ error: 'Erro ao buscar listas' });
  }
};

// POST /api/projects/:projectId/lists
export const createProjectList = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { projectId } = req.params;

    // Verificar se o projeto pertence ao usuário
    const projectCheck = await pool.query(
      `SELECT id FROM projects WHERE id = $1 AND user_id = $2`,
      [projectId, userId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const validated = listSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO project_lists (project_id, user_id, name, order_position)
       VALUES ($1, $2, $3, $4)
       RETURNING id, project_id, name, order_position, created_at, updated_at`,
      [projectId, userId, validated.name, validated.order_position]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating project list:', error);
    res.status(500).json({ error: 'Erro ao criar lista' });
  }
};

// PATCH /api/projects/lists/:listId
export const updateProjectList = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { listId } = req.params;

    const validated = listSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(validated.name);
    }
    if (validated.order_position !== undefined) {
      updates.push(`order_position = $${paramCount++}`);
      values.push(validated.order_position);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(listId, userId);
    const result = await pool.query(
      `UPDATE project_lists
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
       RETURNING id, project_id, name, order_position, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating project list:', error);
    res.status(500).json({ error: 'Erro ao atualizar lista' });
  }
};

// DELETE /api/projects/lists/:listId
export const deleteProjectList = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { listId } = req.params;

    const result = await pool.query(
      `DELETE FROM project_lists
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [listId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project list:', error);
    res.status(500).json({ error: 'Erro ao deletar lista' });
  }
};


