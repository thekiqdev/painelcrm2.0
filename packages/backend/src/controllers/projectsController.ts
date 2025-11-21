import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const projectSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional().nullable(),
  status: z.string().default('active'),
  due_date: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  kanban_stage: z.string().optional().nullable(),
});

// GET /api/projects
export const getProjects = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const result = await pool.query(
      `SELECT id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at
       FROM projects
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const projects = result.rows.map(project => ({
      ...project,
      tags: Array.isArray(project.tags) ? project.tags : [],
      due_date: project.due_date ? new Date(project.due_date).toISOString().split('T')[0] : null,
    }));

    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Erro ao buscar projetos' });
  }
};

// GET /api/projects/:id
export const getProjectById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at
       FROM projects
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const project = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
      due_date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString().split('T')[0] : null,
    };

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Erro ao buscar projeto' });
  }
};

// POST /api/projects
export const createProject = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = projectSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO projects (user_id, name, description, status, due_date, tags, kanban_stage)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at`,
      [
        userId,
        validated.name,
        validated.description || null,
        validated.status,
        validated.due_date || null,
        JSON.stringify(validated.tags || []),
        validated.kanban_stage || null,
      ]
    );

    const project = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
      due_date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString().split('T')[0] : null,
    };

    res.status(201).json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Erro ao criar projeto' });
  }
};

// PATCH /api/projects/:id
export const updateProject = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const validated = projectSchema.partial().parse(req.body);

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
    if (validated.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(validated.status);
    }
    if (validated.due_date !== undefined) {
      updates.push(`due_date = $${paramCount++}`);
      values.push(validated.due_date || null);
    }
    if (validated.tags !== undefined) {
      updates.push(`tags = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.tags));
    }
    if (validated.kanban_stage !== undefined) {
      updates.push(`kanban_stage = $${paramCount++}`);
      values.push(validated.kanban_stage || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE projects
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
       RETURNING id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const project = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
      due_date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString().split('T')[0] : null,
    };

    res.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Erro ao atualizar projeto' });
  }
};

// DELETE /api/projects/:id
export const deleteProject = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM projects
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Erro ao deletar projeto' });
  }
};


