import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { isTenantAdmin } from '../utils/tenant.js';

const MODULE_PROJECTS = 'projects';

function mapProjectRow(row: any) {
  const teamIds = Array.isArray(row.team_ids)
    ? row.team_ids
    : row.team_id
      ? [row.team_id]
      : [];
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
    team_id: row.team_id ?? (teamIds[0] || null),
    team_ids: teamIds,
  };
}

/** Para novo project_type: adicionar aqui, migration (chk_project_type) e branch em createProject; frontend: types.ts + Step1 + Step3. */
const PROJECT_TYPES = ['simple', 'areas', 'advanced', 'template'] as const;

const projectObjectSchema = z.object({
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
  team_ids: z.array(z.string().uuid()).optional().default([]),
  initial_areas: z.array(z.string().min(1)).optional().default([]),
  create_first_version: z.boolean().optional().default(false),
  first_version_name: z.string().optional().nullable(),
  first_version_date: z.string().optional().nullable(),
});

const projectSchema = projectObjectSchema
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

/** Schema para PATCH: todos os campos opcionais (ZodEffects não tem .partial()). */
const projectUpdateSchema = projectObjectSchema.partial();

const PROJECTS_SELECT_COLUMNS = `id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at,
  project_type, template_id, source_template_id, client_id, start_date, end_date, responsible_ids`;
const PROJECTS_SELECT_COLUMNS_WITH_TEAM = `${PROJECTS_SELECT_COLUMNS}, team_id`;
const PROJECTS_SELECT_COLUMNS_WITH_TEAM_IDS = `${PROJECTS_SELECT_COLUMNS}, team_id, COALESCE(team_ids, '[]'::jsonb) AS team_ids`;

// GET /api/projects?team_id=uuid (team_id opcional; tolera BD sem coluna team_id — migração 50)
export const getProjects = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const teamId = (req.query.team_id as string) || null;

    let result;
    const selectWithTeamIds = PROJECTS_SELECT_COLUMNS_WITH_TEAM_IDS;
    const selectWithTeam = PROJECTS_SELECT_COLUMNS_WITH_TEAM;
    const selectWithoutTeam = PROJECTS_SELECT_COLUMNS;

    const tenantId = (req as any).tenantId ?? null;
    if (!tenantId) {
      return res.json([]);
    }

    const runListQuery = async (select: string, extraWhere: string, params: any[]) => {
      try {
        return await pool.query(
          `SELECT p.* FROM projects p
           INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
           WHERE 1=1 ${extraWhere}
           ORDER BY p.created_at DESC`,
          params
        );
      } catch (colErr: any) {
        if (colErr?.code === '42703' || colErr?.message?.includes('team_ids') || colErr?.message?.includes('team_id')) {
          return null;
        }
        throw colErr;
      }
    };

    if (teamId) {
      const teamCheck = await pool.query(
        `SELECT t.id FROM teams t
         INNER JOIN users u ON u.tenant_id = t.tenant_id AND u.id = $1
         WHERE t.id = $2`,
        [userId, teamId]
      );
      if (teamCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Equipe não encontrada ou não pertence à sua empresa' });
      }
      try {
        result = await pool.query(
          `SELECT p.* FROM projects p
           INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
           WHERE (p.team_id = $2 OR (p.team_ids @> to_jsonb(ARRAY[$2::text])))
           ORDER BY p.created_at DESC`,
          [tenantId, teamId]
        );
        if (result.rows.length >= 0) result = { rows: result.rows.map((r: any) => ({ ...r, team_ids: r.team_ids ?? [] })) };
      } catch (colErr: any) {
        if (colErr?.code === '42703' || colErr?.message?.includes('team_ids')) {
          result = await pool.query(
            `SELECT p.* FROM projects p
             INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
             WHERE p.team_id = $2 ORDER BY p.created_at DESC`,
            [tenantId, teamId]
          );
        } else if (colErr?.code === '42703' || colErr?.message?.includes('team_id')) {
          result = { rows: [] };
        } else throw colErr;
      }
    } else {
      result = await runListQuery(selectWithTeamIds, '', [tenantId]);
      if (!result) result = await runListQuery(selectWithTeam, '', [tenantId]);
      if (!result) result = await runListQuery(selectWithoutTeam, '', [tenantId]);
      if (!result) result = { rows: [] };
    }

    let rows = result.rows;
    const isTenantAdminUser = await isTenantAdmin(userId);
    if (!isTenantAdminUser) {
      const userTeamRows = await pool.query<{ team_id: string }>(
        'SELECT team_id FROM team_members WHERE user_id = $1',
        [userId]
      );
      const userTeamIdSet = new Set(userTeamRows.rows.map((r) => r.team_id));
      rows = rows.filter((row: any) => {
        if (row.user_id === userId) return true;
        const respIds: string[] = Array.isArray(row.responsible_ids) ? row.responsible_ids : [];
        if (respIds.includes(userId)) return true;
        const tids: string[] = Array.isArray(row.team_ids) ? row.team_ids : row.team_id ? [row.team_id] : [];
        return tids.some((tid: string) => userTeamIdSet.has(tid));
      });
    }

    const projects = rows.map((project: any) => mapProjectRow(project));
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Erro ao buscar projetos' });
  }
};

const PROJECT_TYPES_WITH_AREAS = ['areas', 'advanced'] as const;

// GET /api/projects/:id (tolera BD sem coluna team_id / team_ids)
export const getProjectById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    let result: any;
    try {
      result = await pool.query(
        `SELECT p.* FROM projects p
         INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
         WHERE p.id = $1`,
        [id, userId]
      );
    } catch (colErr: any) {
      if (colErr?.code === '42703' || colErr?.message?.includes('team_ids') || colErr?.message?.includes('team_id')) {
        try {
          result = await pool.query(
            `SELECT p.* FROM projects p
             INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
             WHERE p.id = $1`,
            [id, userId]
          );
        } catch (colErr2: any) {
          if (colErr2?.code === '42703' || colErr2?.message?.includes('team_id')) {
            result = await pool.query(
              `SELECT p.* FROM projects p
               INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
               WHERE p.id = $1`,
              [id, userId]
            );
          } else throw colErr2;
        }
      } else throw colErr;
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const row = result.rows[0];
    const projectOwnerId = row.user_id;
    const isOwner = projectOwnerId === userId;
    const isTenantAdminUser = await isTenantAdmin(userId);
    if (!isOwner && !isTenantAdminUser) {
      const respIds: string[] = Array.isArray(row.responsible_ids) ? row.responsible_ids : [];
      const inResponsibles = respIds.includes(userId);
      let inTeam = false;
      if (!inResponsibles) {
        const tids: string[] = Array.isArray(row.team_ids) ? row.team_ids : row.team_id ? [row.team_id] : [];
        if (tids.length > 0) {
          const memberCheck = await pool.query(
            'SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = ANY($2::uuid[]) LIMIT 1',
            [userId, tids]
          );
          inTeam = memberCheck.rows.length > 0;
        }
      }
      if (!inResponsibles && !inTeam) {
        return res.status(404).json({ error: 'Projeto não encontrado' });
      }
    }

    const project = mapProjectRow(row);
    const projectType = (project as any).project_type ?? 'simple';

    if (PROJECT_TYPES_WITH_AREAS.includes(projectType as any)) {
      const areasResult = await pool.query(
        `SELECT id, project_id, name, sort_order, responsible_ids, team_ids, created_at, updated_at
         FROM project_areas WHERE project_id = $1 ORDER BY sort_order ASC, name ASC`,
        [id]
      );
      let areas = areasResult.rows;
      const isAdminAreas = isOwner || isTenantAdminUser;
      if (!isAdminAreas) {
        const userTeams = await pool.query<{ team_id: string }>(
          'SELECT team_id FROM team_members WHERE user_id = $1',
          [userId]
        );
        const userTeamIdSet = new Set(userTeams.rows.map((r) => r.team_id));
        areas = areas.filter((row: any) => {
          const respIds: string[] = Array.isArray(row.responsible_ids) ? row.responsible_ids : [];
          if (respIds.includes(userId)) return true;
          const tids: string[] = Array.isArray(row.team_ids) ? row.team_ids : [];
          return tids.some((tid: string) => userTeamIdSet.has(tid));
        });
      }
      (project as any).areas = areas;
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
    await assertModulePermission(userId, MODULE_PROJECTS, 'create', undefined, req as AuthRequest);
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
        `SELECT c.id FROM clients c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
         WHERE c.id = $1`,
        [clientId, userId]
      );
      if (clientCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Cliente não encontrado' });
      }
    }

    const teamIds = Array.isArray(validated.team_ids) && validated.team_ids.length > 0
      ? validated.team_ids
      : validated.team_id
        ? [validated.team_id]
        : [];
    for (const tid of teamIds) {
      const teamCheck = await pool.query(
        `SELECT t.id FROM teams t
         INNER JOIN users u ON u.tenant_id = t.tenant_id AND u.id = $1
         WHERE t.id = $2`,
        [userId, tid]
      );
      if (teamCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Equipe não encontrada ou não pertence à sua empresa' });
      }
    }
    const primaryTeamId = teamIds[0] ?? null;

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
      if (!isSystem) {
        const templateInTenant = await pool.query(
          `SELECT 1 FROM users u WHERE u.id = $1 AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)`,
          [template.user_id, userId]
        );
        if (templateInTenant.rows.length === 0) {
          return res.status(403).json({ error: 'Template não disponível para este usuário' });
        }
      }
      sourceTemplateId = templateId;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let projectResult: any;
      try {
        projectResult = await client.query(
          `INSERT INTO projects (user_id, name, description, status, due_date, tags, kanban_stage, project_type, source_template_id, client_id, start_date, end_date, responsible_ids, team_id, team_ids)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz, $13::jsonb, $14, $15::jsonb)
           RETURNING id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at, project_type, template_id, source_template_id, client_id, start_date, end_date, responsible_ids, team_id, team_ids`,
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
            primaryTeamId,
            JSON.stringify(teamIds),
          ]
        );
      } catch (insErr: any) {
        if (insErr?.code === '42703' && insErr?.message?.includes('team_ids')) {
          projectResult = await client.query(
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
              primaryTeamId,
            ]
          );
        } else throw insErr;
      }
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
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
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
    const existing = await pool.query(
      `SELECT p.user_id FROM projects p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE p.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }
    await assertModulePermission(userId, MODULE_PROJECTS, 'edit', {
      ownerId: existing.rows[0].user_id,
    }, req as AuthRequest);
    const validated = projectUpdateSchema.parse(req.body);

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
    if (validated.team_ids !== undefined) {
      const teamIds = validated.team_ids;
      for (const tid of teamIds) {
        const teamCheck = await pool.query(
          `SELECT t.id FROM teams t INNER JOIN users u ON u.tenant_id = t.tenant_id AND u.id = $1 WHERE t.id = $2`,
          [userId, tid]
        );
        if (teamCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Equipe não encontrada ou não pertence à sua empresa' });
        }
      }
      const primaryTeamId = teamIds[0] ?? null;
      updates.push(`team_id = $${paramCount++}`);
      values.push(primaryTeamId);
      updates.push(`team_ids = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(teamIds));
    } else if (validated.team_id !== undefined) {
      const teamId = validated.team_id;
      if (teamId) {
        const teamCheck = await pool.query(
          `SELECT t.id FROM teams t INNER JOIN users u ON u.tenant_id = t.tenant_id AND u.id = $1 WHERE t.id = $2`,
          [userId, teamId]
        );
        if (teamCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Equipe não encontrada ou não pertence à sua empresa' });
        }
      }
      updates.push(`team_id = $${paramCount++}`);
      values.push(teamId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    const returningCols = updates.some((u) => u.startsWith('team_ids'))
      ? 'id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at, project_type, template_id, source_template_id, client_id, start_date, end_date, responsible_ids, team_id, team_ids'
      : 'id, name, description, status, due_date, tags, kanban_stage, created_at, updated_at, project_type, template_id, source_template_id, client_id, start_date, end_date, responsible_ids, team_id';
    values.push(id);
    const result = await pool.query(
      `UPDATE projects
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramCount + 1}))
       RETURNING ${returningCols}`,
      [...values, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    res.json(mapProjectRow(result.rows[0]));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
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
    const existing = await pool.query(
      `SELECT p.user_id FROM projects p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE p.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }
    await assertModulePermission(userId, MODULE_PROJECTS, 'delete', {
      ownerId: existing.rows[0].user_id,
    }, req as AuthRequest);
    const result = await pool.query(
      `DELETE FROM projects
       WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Erro ao deletar projeto' });
  }
};


