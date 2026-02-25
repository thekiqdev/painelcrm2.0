import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

function mapProjectRow(row: any) {
  return {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : [],
    due_date: row.due_date ? new Date(row.due_date).toISOString().split('T')[0] : null,
    project_type: row.project_type ?? 'simple',
    template_id: row.template_id ?? null,
    source_template_id: row.source_template_id ?? null,
    client_id: row.client_id ?? null,
    start_date: row.start_date ? new Date(row.start_date).toISOString().split('T')[0] : null,
    end_date: row.end_date ? new Date(row.end_date).toISOString().split('T')[0] : null,
    responsible_ids: Array.isArray(row.responsible_ids) ? row.responsible_ids : [],
    team_id: row.team_id ?? null,
  };
}

/** Para novo project_type: adicionar aqui, migration (chk_project_type) e branch em createProject; frontend: types.ts + Step1 + Step3. */
const PROJECT_TYPES = ['simple', 'areas', 'advanced', 'template'] as const;

const projectSchema = z
  .object({
    name: z.string().min(1, 'Nome é obrigatório'),
    description: z.string().optional().nullable(),
    status: z.string().default('active'),
    due_date: z.string().optional().nullable(),
    tags: z.array(z.string()).default([]),
    kanban_stage: z.string().optional().nullable(),
    project_type: z.enum(PROJECT_TYPES).optional().default('simple'),
    template_id: z.string().uuid().optional().nullable(),
    client_id: z.string().uuid().optional().nullable(),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    responsible_ids: z.array(z.string().uuid()).optional().default([]),
    team_id: z.string().uuid().optional().nullable(),
    initial_areas: z.array(z.string().min(1)).optional().default([]),
    create_first_version: z.boolean().optional().default(false),
    first_version_name: z.string().optional().nullable(),
    first_version_date: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.project_type === 'template') return !!data.template_id;
      return true;
    },
    { message: 'template_id é obrigatório quando project_type é template', path: ['template_id'] }
  )
  .refine(
    (data) => {
      if (data.project_type !== 'template') return !data.template_id;
      return true;
    },
    { message: 'template_id deve ser null quando project_type não é template', path: ['template_id'] }
  );

const PROJECTS_SELECT_COLUMNS = `id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at,
  project_type, template_id, source_template_id, client_id, start_date, end_date, responsible_ids`;
const PROJECTS_SELECT_COLUMNS_WITH_TEAM = `${PROJECTS_SELECT_COLUMNS}, team_id`;

// GET /api/projects?team_id=uuid (team_id opcional; tolera BD sem coluna team_id — migração 50)
export const getProjects = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const teamId = (req.query.team_id as string) || null;

    let result;
    const selectWithTeam = PROJECTS_SELECT_COLUMNS_WITH_TEAM;
    const selectWithoutTeam = PROJECTS_SELECT_COLUMNS;

    if (teamId) {
      const teamCheck = await pool.query(
        `SELECT t.id FROM teams t
         INNER JOIN users u ON u.tenant_id = t.tenant_id AND u.id = $1
         WHERE t.id = $2`,
        [userId, teamId]
      );
      if (teamCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Equipe não encontrada ou não pertence ao seu tenant' });
      }
      try {
        result = await pool.query(
          `SELECT ${selectWithTeam} FROM projects WHERE user_id = $1 AND team_id = $2 ORDER BY created_at DESC`,
          [userId, teamId]
        );
      } catch (colErr: any) {
        if (colErr?.code === '42703' || colErr?.message?.includes('team_id')) {
          result = { rows: [] };
        } else throw colErr;
      }
    } else {
      try {
        result = await pool.query(
          `SELECT ${selectWithTeam} FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
          [userId]
        );
      } catch (colErr: any) {
        if (colErr?.code === '42703' || colErr?.message?.includes('team_id')) {
          result = await pool.query(
            `SELECT ${selectWithoutTeam} FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
          );
        } else throw colErr;
      }
    }

    const projects = result.rows.map((project: any) => mapProjectRow(project));
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Erro ao buscar projetos' });
  }
};

const PROJECT_TYPES_WITH_AREAS = ['areas', 'advanced'] as const;

// GET /api/projects/:id (tolera BD sem coluna team_id)
export const getProjectById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    let result;
    try {
      result = await pool.query(
        `SELECT ${PROJECTS_SELECT_COLUMNS_WITH_TEAM} FROM projects WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
    } catch (colErr: any) {
      if (colErr?.code === '42703' || colErr?.message?.includes('team_id')) {
        result = await pool.query(
          `SELECT ${PROJECTS_SELECT_COLUMNS} FROM projects WHERE id = $1 AND user_id = $2`,
          [id, userId]
        );
      } else throw colErr;
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const project = mapProjectRow(result.rows[0]);
    const projectType = (project as any).project_type ?? 'simple';

    if (PROJECT_TYPES_WITH_AREAS.includes(projectType as any)) {
      const areasResult = await pool.query(
        `SELECT id, project_id, name, sort_order, responsible_ids, created_at, updated_at
         FROM project_areas WHERE project_id = $1 ORDER BY sort_order ASC, name ASC`,
        [id]
      );
      (project as any).areas = areasResult.rows;
    } else {
      (project as any).areas = [];
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Erro ao buscar projeto' });
  }
};

const DEFAULT_LISTS = [
  { name: 'A Fazer', order_position: 0 },
  { name: 'Em Andamento', order_position: 1 },
  { name: 'Revisão', order_position: 2 },
  { name: 'Concluídos', order_position: 3 },
];

// POST /api/projects
export const createProject = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = projectSchema.parse(req.body);
    const projectType = validated.project_type ?? 'simple';
    const templateId = validated.template_id ?? null;
    const clientId = validated.client_id ?? null;
    const responsibleIds = validated.responsible_ids ?? [];
    const initialAreas = validated.initial_areas ?? [];
    const createFirstVersion = validated.create_first_version === true;
    const firstVersionName = validated.first_version_name?.trim() || null;
    const firstVersionDate = validated.first_version_date || null;

    if (clientId) {
      const clientCheck = await pool.query(
        `SELECT id FROM clients WHERE id = $1 AND user_id = $2`,
        [clientId, userId]
      );
      if (clientCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Cliente não encontrado' });
      }
    }

    let teamId: string | null = validated.team_id ?? null;
    if (teamId) {
      const teamCheck = await pool.query(
        `SELECT t.id FROM teams t
         INNER JOIN users u ON u.tenant_id = t.tenant_id AND u.id = $1
         WHERE t.id = $2`,
        [userId, teamId]
      );
      if (teamCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Equipe não encontrada ou não pertence ao seu tenant' });
      }
    }

    let sourceTemplateId: string | null = null;
    if (templateId) {
      const templateResult = await pool.query(
        `SELECT id, user_id, is_system FROM project_templates WHERE id = $1`,
        [templateId]
      );
      if (templateResult.rows.length === 0) {
        return res.status(400).json({ error: 'Template não encontrado' });
      }
      const template = templateResult.rows[0];
      const isSystem = template.is_system === true;
      const belongsToUser = template.user_id === userId;
      if (!isSystem && !belongsToUser) {
        return res.status(403).json({ error: 'Template não disponível para este usuário' });
      }
      sourceTemplateId = templateId;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const projectResult = await client.query(
        `INSERT INTO projects (user_id, name, description, status, due_date, tags, kanban_stage, project_type, source_template_id, client_id, start_date, end_date, responsible_ids, team_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz, $13::jsonb, $14)
         RETURNING id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at, project_type, template_id, source_template_id, client_id, start_date, end_date, responsible_ids, team_id`,
        [
          userId,
          validated.name,
          validated.description || null,
          validated.status,
          validated.due_date || null,
          JSON.stringify(validated.tags || []),
          validated.kanban_stage || null,
          projectType,
          sourceTemplateId,
          clientId,
          validated.start_date || null,
          validated.end_date || null,
          JSON.stringify(responsibleIds),
          teamId,
        ]
      );
      const project = projectResult.rows[0];
      const projectId = project.id;

      if ((projectType === 'areas' || projectType === 'advanced') && initialAreas.length > 0) {
        for (let i = 0; i < initialAreas.length; i++) {
          await client.query(
            `INSERT INTO project_areas (project_id, name, sort_order) VALUES ($1, $2, $3)`,
            [projectId, initialAreas[i].trim(), i]
          );
        }
      }

      if (projectType === 'simple' || projectType === 'areas' || projectType === 'advanced') {
        for (const list of DEFAULT_LISTS) {
          await client.query(
            `INSERT INTO project_lists (project_id, user_id, name, order_position) VALUES ($1, $2, $3, $4)`,
            [projectId, userId, list.name, list.order_position]
          );
        }
      }

      if (projectType === 'advanced' && createFirstVersion && firstVersionName) {
        await client.query(
          `INSERT INTO project_versions (project_id, name, release_date, status, sort_order) VALUES ($1, $2, $3::timestamptz, 'planned', 0)`,
          [projectId, firstVersionName, firstVersionDate]
        );
      }

      if (projectType === 'template' && sourceTemplateId) {
        const stagesResult = await client.query(
          `SELECT id, name, order_position FROM project_template_stages WHERE template_id = $1 ORDER BY order_position ASC`,
          [sourceTemplateId]
        );
        const stageIdToListId: Record<string, string> = {};
        for (const row of stagesResult.rows) {
          const listResult = await client.query(
            `INSERT INTO project_lists (project_id, user_id, name, order_position) VALUES ($1, $2, $3, $4) RETURNING id`,
            [projectId, userId, row.name, row.order_position]
          );
          stageIdToListId[row.id] = listResult.rows[0].id;
        }
        const stageIds = stagesResult.rows.map((r: any) => r.id);
        if (stageIds.length > 0) {
          const tasksResult = await client.query(
            `SELECT id, stage_id, title, description, offset_days, duration_days, priority, tags FROM project_template_tasks WHERE stage_id = ANY($1::uuid[])`,
            [stageIds]
          );
          for (const task of tasksResult.rows) {
            const newListId = stageIdToListId[task.stage_id];
            if (!newListId) continue;
            await client.query(
              `INSERT INTO project_tasks (list_id, project_id, user_id, title, description, status, priority, tags) VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7::jsonb)`,
              [
                newListId,
                projectId,
                userId,
                task.title,
                task.description || null,
                task.priority || 'medium',
                JSON.stringify(Array.isArray(task.tags) ? task.tags : []),
              ]
            );
          }
        }
      }

      await client.query('COMMIT');
      res.status(201).json(mapProjectRow(project));
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
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
    if (validated.client_id !== undefined) {
      updates.push(`client_id = $${paramCount++}`);
      values.push(validated.client_id || null);
    }
    if (validated.start_date !== undefined) {
      updates.push(`start_date = $${paramCount++}::timestamptz`);
      values.push(validated.start_date || null);
    }
    if (validated.end_date !== undefined) {
      updates.push(`end_date = $${paramCount++}::timestamptz`);
      values.push(validated.end_date || null);
    }
    if (validated.responsible_ids !== undefined) {
      updates.push(`responsible_ids = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.responsible_ids));
    }
    if (validated.team_id !== undefined) {
      const teamId = validated.team_id;
      if (teamId) {
        const teamCheck = await pool.query(
          `SELECT t.id FROM teams t INNER JOIN users u ON u.tenant_id = t.tenant_id AND u.id = $1 WHERE t.id = $2`,
          [userId, teamId]
        );
        if (teamCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Equipe não encontrada ou não pertence ao seu tenant' });
        }
      }
      updates.push(`team_id = $${paramCount++}`);
      values.push(teamId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE projects
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
       RETURNING id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at, project_type, template_id, source_template_id, client_id, start_date, end_date, responsible_ids, team_id`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    res.json(mapProjectRow(result.rows[0]));
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


