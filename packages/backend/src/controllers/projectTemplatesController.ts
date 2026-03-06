import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';
const templateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

const stageSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  order_position: z.number().int().min(0),
  offset_days: z.number().int().default(0),
});

const taskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  offset_days: z.number().int().default(0),
  duration_days: z.number().int().default(1),
  priority: z.string().default('medium'),
  role: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

// GET /api/project-templates
export const getProjectTemplates = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId ?? null;
    if (!tenantId) {
      return res.json([]);
    }
    const result = await pool.query(
      `SELECT pt.id, pt.name, pt.description, pt.tags, pt.created_at, pt.updated_at
       FROM project_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = $1
       ORDER BY pt.created_at DESC`,
      [tenantId]
    );

    const templates = result.rows.map(template => ({
      ...template,
      tags: Array.isArray(template.tags) ? template.tags : [],
    }));

    res.json(templates);
  } catch (error) {
    console.error('Error fetching project templates:', error);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
};

// GET /api/project-templates/:id
export const getProjectTemplateById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT pt.id, pt.name, pt.description, pt.tags, pt.created_at, pt.updated_at
       FROM project_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE pt.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    const template = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
    };

    res.json(template);
  } catch (error) {
    console.error('Error fetching project template:', error);
    res.status(500).json({ error: 'Erro ao buscar template' });
  }
};

// POST /api/project-templates
export const createProjectTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = templateSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO project_templates (user_id, name, description, tags)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, name, description, tags, created_at, updated_at`,
      [userId, validated.name, validated.description || null, JSON.stringify(validated.tags || [])]
    );

    const template = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
    };

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating project template:', error);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
};

// PATCH /api/project-templates/:id
export const updateProjectTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const validated = templateSchema.partial().parse(req.body);

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
    if (validated.tags !== undefined) {
      updates.push(`tags = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.tags));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE project_templates
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramCount + 1}))
       RETURNING id, name, description, tags, created_at, updated_at`,
      [...values, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    const template = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
    };

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating project template:', error);
    res.status(500).json({ error: 'Erro ao atualizar template' });
  }
};

// DELETE /api/project-templates/:id
export const deleteProjectTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM project_templates
       WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project template:', error);
    res.status(500).json({ error: 'Erro ao deletar template' });
  }
};

// GET /api/project-templates/:id/stages
export const getTemplateStages = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const templateCheck = await pool.query(
      `SELECT pt.id FROM project_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE pt.id = $1`,
      [id, userId]
    );
    if (templateCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    const result = await pool.query(
      `SELECT s.id, s.template_id, s.name, s.order_position, s.offset_days, s.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', t.id,
                    'stage_id', t.stage_id,
                    'title', t.title,
                    'description', t.description,
                    'offset_days', t.offset_days,
                    'duration_days', t.duration_days,
                    'priority', t.priority,
                    'role', t.role,
                    'tags', t.tags,
                    'created_at', t.created_at
                  ) ORDER BY t.created_at
                ) FILTER (WHERE t.id IS NOT NULL),
                '[]'::json
              ) as tasks
       FROM project_template_stages s
       LEFT JOIN project_template_tasks t ON s.id = t.stage_id
       WHERE s.template_id = $1
       GROUP BY s.id, s.template_id, s.name, s.order_position, s.offset_days, s.created_at
       ORDER BY s.order_position ASC`,
      [id]
    );

    const stages = result.rows.map(stage => ({
      ...stage,
      tasks: (stage.tasks || []).map((task: any) => ({
        ...task,
        tags: Array.isArray(task.tags) ? task.tags : [],
      })),
    }));

    res.json(stages);
  } catch (error) {
    console.error('Error fetching template stages:', error);
    res.status(500).json({ error: 'Erro ao buscar estágios' });
  }
};

// POST /api/project-templates/:id/stages
export const createTemplateStage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const templateCheck = await pool.query(
      `SELECT pt.id FROM project_templates pt
       INNER JOIN users u ON u.id = pt.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE pt.id = $1`,
      [id, userId]
    );

    if (templateCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    const validated = stageSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO project_template_stages (template_id, name, order_position, offset_days)
       VALUES ($1, $2, $3, $4)
       RETURNING id, template_id, name, order_position, offset_days, created_at`,
      [id, validated.name, validated.order_position, validated.offset_days]
    );

    res.status(201).json({ ...result.rows[0], tasks: [] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating template stage:', error);
    res.status(500).json({ error: 'Erro ao criar estágio' });
  }
};

// POST /api/project-templates/stages/:stageId/tasks
export const createTemplateTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { stageId } = req.params;

    const stageCheck = await pool.query(
      `SELECT s.id, s.template_id
       FROM project_template_stages s
       INNER JOIN project_templates t ON s.template_id = t.id
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE s.id = $1`,
      [stageId, userId]
    );

    if (stageCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Estágio não encontrado' });
    }

    const validated = taskSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO project_template_tasks (stage_id, title, description, offset_days, duration_days, priority, role, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, stage_id, title, description, offset_days, duration_days, priority, role, tags, created_at`,
      [
        stageId,
        validated.title,
        validated.description || null,
        validated.offset_days,
        validated.duration_days,
        validated.priority,
        validated.role || null,
        JSON.stringify(validated.tags || []),
      ]
    );

    const task = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
    };

    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating template task:', error);
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
};

