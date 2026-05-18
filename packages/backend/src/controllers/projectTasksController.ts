import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, assertPermissionKey, ModulePermissionError } from '../permissions/index.js';
import {
  assertAreaInProject,
  assertListInProject,
  assertVersionInProject,
  appendProjectTaskVersionFilter,
  getDefaultProjectVersionId,
  projectAllowsAreas,
  projectAllowsVersions,
} from '../services/projectVersionsScope.js';
const MODULE_TASKS = 'tasks';
const MODULE_PROJECTS = 'projects';
const RELEASE_NOTE_TYPES = ['feature', 'fix', 'improvement', 'internal'] as const;

async function isProjectVersionFrozen(projectId: string, versionId: string | null | undefined): Promise<boolean> {
  let effectiveVersionId = versionId ?? null;
  if (!effectiveVersionId) {
    effectiveVersionId = await getDefaultProjectVersionId(projectId);
  }
  if (!effectiveVersionId) return false;
  const result = await pool.query<{ frozen: boolean }>(
    `SELECT frozen FROM project_versions WHERE id = $1 AND project_id = $2`,
    [effectiveVersionId, projectId],
  );
  return result.rows[0]?.frozen === true;
}

/** Valor para coluna jsonb: null, string JSON como está, objeto stringificado. */
function formatJsonbForDb(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

const taskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  status: z.string().default('todo'),
  priority: z.string().default('medium'),
  due_date: z.string().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).default([]),
  start_date: z.string().optional().nullable(),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  estimated_effort_hours: z.number().optional().nullable(),
  estimated_story_points: z.number().optional().nullable(),
  checklist: z.array(z.any()).default([]),
  attachments: z.array(z.any()).default([]),
  dependencies: z.array(z.any()).default([]),
  watchers: z.array(z.string()).default([]),
  reminders: z.array(z.any()).default([]),
  recurrence_rule: z.any().optional().nullable(),
  milestone_id: z.string().uuid().optional().nullable(),
  parent_task_id: z.string().uuid().optional().nullable(),
  sprint_id: z.string().uuid().optional().nullable(),
  visibility: z.string().default('internal'),
  billable: z.boolean().default(false),
  hourly_rate: z.number().optional().nullable(),
  budget_cap: z.number().optional().nullable(),
  custom_fields: z.record(z.any()).default({}),
  severity: z.string().optional().nullable(),
  task_type: z.string().default('task'),
  meeting_location: z.string().optional().nullable(),
  meeting_link: z.string().optional().nullable(),
  area_id: z.string().uuid().optional().nullable(),
  version_id: z.string().uuid().optional().nullable(),
  list_id: z.string().uuid().optional().nullable(),
  include_in_release_notes: z.boolean().optional(),
  release_note_type: z.enum(RELEASE_NOTE_TYPES).optional().nullable(),
});

const TASK_SELECT = `id, list_id, project_id, area_id, version_id, title, description, status, priority, due_date, assignee_id,
  tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
  checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
  milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
  budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
  include_in_release_notes, release_note_type,
  created_at, updated_at`;

function mapTaskRow(row: any) {
  return {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : [],
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    watchers: Array.isArray(row.watchers) ? row.watchers : [],
    reminders: Array.isArray(row.reminders) ? row.reminders : [],
    custom_fields: row.custom_fields || {},
    due_date: row.due_date ? new Date(row.due_date).toISOString() : null,
    start_date: row.start_date ? new Date(row.start_date).toISOString() : null,
    estimated_effort_hours: row.estimated_effort_hours != null ? parseFloat(row.estimated_effort_hours) : null,
    estimated_story_points: row.estimated_story_points != null ? parseFloat(row.estimated_story_points) : null,
    hourly_rate: row.hourly_rate != null ? parseFloat(row.hourly_rate) : null,
    budget_cap: row.budget_cap != null ? parseFloat(row.budget_cap) : null,
  };
}

// GET /api/projects/lists/:listId/tasks?areaId=uuid&versionId=uuid|none
export const getProjectTasks = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    try {
      await assertPermissionKey(userId, 'tasks.view', req as AuthRequest);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      throw e;
    }

    const tenantId = (req as any).tenantId ?? null;
    const { listId } = req.params;
    const areaId = (req.query.areaId as string) || null;
    const versionIdRaw = (req.query.versionId as string) || null;

    if (!tenantId) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    const listCheck = await pool.query(
      `SELECT pl.id, pl.project_id
       FROM project_lists pl
       INNER JOIN projects p ON pl.project_id = p.id
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
       WHERE pl.id = $2`,
      [tenantId, listId]
    );

    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    let sql = `SELECT ${TASK_SELECT}
         FROM project_tasks
         WHERE list_id = $1`;
    const params: unknown[] = [listId];
    const projectId = listCheck.rows[0].project_id as string;
    if (areaId) {
      params.push(areaId);
      sql += ` AND area_id = $${params.length}`;
    }
    sql = await appendProjectTaskVersionFilter(sql, params, versionIdRaw, projectId);
    sql += ' ORDER BY created_at ASC';

    const result = await pool.query(sql, params);

    res.json(result.rows.map(mapTaskRow));
  } catch (error) {
    console.error('Error fetching project tasks:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefas' });
  }
};

// Condição SQL reutilizável: tarefa acessível ao usuário (dono do projeto ou mesmo tenant)
const TASK_ACCESS_WHERE = `
  FROM project_tasks t
  INNER JOIN projects p ON t.project_id = p.id
  INNER JOIN users owner ON owner.id = p.user_id
  WHERE t.id = $1 AND (
    p.user_id = $2
    OR (owner.tenant_id IS NOT NULL AND owner.tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
  )`;

// GET /api/projects/tasks/:taskId
export const getProjectTaskById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    try {
      await assertPermissionKey(userId, 'tasks.view', req as AuthRequest);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      throw e;
    }

    const { taskId } = req.params;

    const taskCheck = await pool.query(
      `SELECT t.id ${TASK_ACCESS_WHERE}`,
      [taskId, userId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const result = await pool.query(
      `SELECT ${TASK_SELECT}
       FROM project_tasks
       WHERE id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.json(mapTaskRow(result.rows[0]));
  } catch (error) {
    console.error('Error fetching project task:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefa' });
  }
};

// POST /api/projects/lists/:listId/tasks
export const createProjectTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const tenantId = (req as any).tenantId ?? null;
    const { listId } = req.params;
    await assertModulePermission(userId, MODULE_TASKS, 'create', undefined, req as AuthRequest);

    if (!tenantId) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }
    const listCheck = await pool.query(
      `SELECT pl.id, pl.project_id
       FROM project_lists pl
       INNER JOIN projects p ON pl.project_id = p.id
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
       WHERE pl.id = $2`,
      [tenantId, listId]
    );

    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const projectId = listCheck.rows[0].project_id;
    const validated = taskSchema.parse(req.body);
    const projectRow = await pool.query<{ project_type: string }>(
      `SELECT project_type FROM projects WHERE id = $1`,
      [projectId],
    );
    const projectType = projectRow.rows[0]?.project_type ?? 'simple';
    let areaId = validated.area_id ?? null;
    let versionId = validated.version_id ?? null;

    if (projectAllowsVersions(projectType)) {
      if (!versionId) {
        versionId = await getDefaultProjectVersionId(projectId);
      }
      if (!versionId) {
        return res.status(400).json({ error: 'Projeto avançado exige versão para novas tarefas' });
      }
    }

    if (versionId && !projectAllowsVersions(projectType)) {
      return res.status(400).json({ error: 'Este tipo de projeto não aceita versão em tarefas' });
    }
    if (versionId && !(await assertVersionInProject(versionId, projectId))) {
      return res.status(400).json({ error: 'Versão não pertence ao projeto' });
    }
    if (versionId && await isProjectVersionFrozen(projectId, versionId)) {
      return res.status(400).json({ error: 'Não é possível criar tarefa em versão congelada' });
    }
    if (areaId && !projectAllowsAreas(projectType)) {
      return res.status(400).json({ error: 'Este tipo de projeto não aceita área em tarefas' });
    }
    if (areaId && !(await assertAreaInProject(areaId, projectId))) {
      return res.status(400).json({ error: 'Área não pertence ao projeto' });
    }

    const result = await pool.query(
      `INSERT INTO project_tasks (
        list_id, project_id, user_id, area_id, version_id, title, description, status, priority, due_date, assignee_id,
        tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
        checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
        milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
        budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
        include_in_release_notes, release_note_type
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17,
        $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23::jsonb,
        $24, $25, $26, $27, $28, $29, $30, $31, $32::jsonb, $33, $34, $35, $36, $37
      )
      RETURNING ${TASK_SELECT}`,
      [
        listId,
        projectId,
        userId,
        areaId,
        versionId,
        validated.title,
        validated.description || null,
        validated.status,
        validated.priority,
        validated.due_date || null,
        validated.assignee_id || null,
        JSON.stringify(validated.tags || []),
        validated.start_date || null,
        validated.start_time || null,
        validated.end_time || null,
        validated.estimated_effort_hours || null,
        validated.estimated_story_points || null,
        JSON.stringify(validated.checklist || []),
        JSON.stringify(validated.attachments || []),
        JSON.stringify(validated.dependencies || []),
        JSON.stringify(validated.watchers || []),
        JSON.stringify(validated.reminders || []),
        formatJsonbForDb(validated.recurrence_rule),
        validated.milestone_id || null,
        validated.parent_task_id || null,
        validated.sprint_id || null,
        validated.visibility,
        validated.billable,
        validated.hourly_rate || null,
        validated.budget_cap || null,
        JSON.stringify(validated.custom_fields || {}),
        validated.severity || null,
        validated.task_type,
        validated.meeting_location || null,
        validated.meeting_link || null,
        validated.include_in_release_notes ?? true,
        validated.release_note_type || null,
      ]
    );

    res.status(201).json(mapTaskRow(result.rows[0]));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    const err = error as Error & { code?: string; detail?: string };
    console.error('Error creating project task:', err?.message ?? error);
    if (err?.code) console.error('DB code:', err.code, err.detail ?? '');
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
};

// PATCH /api/projects/tasks/:taskId
export const updateProjectTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;
    const taskRow = await pool.query(
      `SELECT t.user_id, t.assignee_id ${TASK_ACCESS_WHERE}`,
      [taskId, userId]
    );
    if (taskRow.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    await assertModulePermission(userId, MODULE_TASKS, 'edit', {
      ownerId: taskRow.rows[0].user_id,
      assigneeId: taskRow.rows[0].assignee_id,
    }, req as AuthRequest);
    const validated = taskSchema.partial().parse(req.body);

    const taskCheck = await pool.query(
      `SELECT t.id, t.project_id, t.version_id, p.project_type ${TASK_ACCESS_WHERE}`,
      [taskId, userId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const projectId = taskCheck.rows[0].project_id as string;
    const projectType = taskCheck.rows[0].project_type as string;
    const currentVersionId = taskCheck.rows[0].version_id as string | null;

    if (projectAllowsVersions(projectType) && await isProjectVersionFrozen(projectId, currentVersionId)) {
      return res.status(400).json({ error: 'Não é possível editar tarefa de versão congelada' });
    }

    if (validated.version_id !== undefined) {
      if (validated.version_id && !projectAllowsVersions(projectType)) {
        return res.status(400).json({ error: 'Este tipo de projeto não aceita versão em tarefas' });
      }
      if (validated.version_id && !(await assertVersionInProject(validated.version_id, projectId))) {
        return res.status(400).json({ error: 'Versão não pertence ao projeto' });
      }
      if (validated.version_id && await isProjectVersionFrozen(projectId, validated.version_id)) {
        return res.status(400).json({ error: 'Não é possível mover tarefa para versão congelada' });
      }
    }

    if (validated.area_id !== undefined) {
      if (validated.area_id && !projectAllowsAreas(projectType)) {
        return res.status(400).json({ error: 'Este tipo de projeto não aceita área em tarefas' });
      }
      if (validated.area_id && !(await assertAreaInProject(validated.area_id, projectId))) {
        return res.status(400).json({ error: 'Área não pertence ao projeto' });
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Construir updates dinamicamente
    const fieldMappings: Record<string, any> = {
      list_id: validated.list_id,
      area_id: validated.area_id,
      version_id: validated.version_id,
      title: validated.title,
      description: validated.description,
      status: validated.status,
      priority: validated.priority,
      due_date: validated.due_date,
      assignee_id: validated.assignee_id,
      tags: validated.tags ? JSON.stringify(validated.tags) : undefined,
      start_date: validated.start_date,
      start_time: validated.start_time,
      end_time: validated.end_time,
      estimated_effort_hours: validated.estimated_effort_hours,
      estimated_story_points: validated.estimated_story_points,
      checklist: validated.checklist ? JSON.stringify(validated.checklist) : undefined,
      attachments: validated.attachments ? JSON.stringify(validated.attachments) : undefined,
      dependencies: validated.dependencies ? JSON.stringify(validated.dependencies) : undefined,
      watchers: validated.watchers ? JSON.stringify(validated.watchers) : undefined,
      reminders: validated.reminders ? JSON.stringify(validated.reminders) : undefined,
      recurrence_rule: validated.recurrence_rule != null ? formatJsonbForDb(validated.recurrence_rule) : undefined,
      milestone_id: validated.milestone_id,
      parent_task_id: validated.parent_task_id,
      sprint_id: validated.sprint_id,
      visibility: validated.visibility,
      billable: validated.billable,
      hourly_rate: validated.hourly_rate,
      budget_cap: validated.budget_cap,
      custom_fields: validated.custom_fields ? JSON.stringify(validated.custom_fields) : undefined,
      severity: validated.severity,
      task_type: validated.task_type,
      meeting_location: validated.meeting_location,
      meeting_link: validated.meeting_link,
      include_in_release_notes: validated.include_in_release_notes,
      release_note_type: validated.release_note_type,
    };

    for (const [key, value] of Object.entries(fieldMappings)) {
      if (value !== undefined) {
        if (['tags', 'checklist', 'attachments', 'dependencies', 'watchers', 'reminders', 'recurrence_rule', 'custom_fields'].includes(key)) {
          updates.push(`${key} = $${paramCount++}::jsonb`);
        } else {
          updates.push(`${key} = $${paramCount++}`);
        }
        values.push(value === null ? null : value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    if (validated.list_id) {
      const listOk = await assertListInProject(validated.list_id, projectId);
      if (!listOk) {
        return res.status(400).json({ error: 'Lista não pertence ao projeto da tarefa' });
      }
    }

    values.push(taskId);
    const result = await pool.query(
      `UPDATE project_tasks
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount}
       RETURNING ${TASK_SELECT}`,
      values
    );

    res.json(mapTaskRow(result.rows[0]));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating project task:', error);
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
};

// DELETE /api/projects/tasks/:taskId
export const deleteProjectTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;

    const taskCheck = await pool.query(
      `SELECT t.id, t.user_id, t.assignee_id ${TASK_ACCESS_WHERE}`,
      [taskId, userId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    const row = taskCheck.rows[0];
    await assertModulePermission(userId, MODULE_TASKS, 'delete', {
      ownerId: row.user_id,
      assigneeId: row.assignee_id,
    }, req as AuthRequest);
    await pool.query(
      `DELETE FROM project_tasks WHERE id = $1`,
      [taskId]
    );

    res.status(204).send();
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error deleting project task:', error);
    res.status(500).json({ error: 'Erro ao deletar tarefa' });
  }
};

// GET /api/projects/:projectId/areas/:areaId/tasks — tarefas da área (para painel contextual)
export const getTasksByArea = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    try {
      await assertPermissionKey(userId, 'tasks.view', req as AuthRequest);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      throw e;
    }

    const tenantId = (req as any).tenantId ?? null;
    const { projectId, areaId } = req.params;

    const versionIdRaw = (req.query.versionId as string) || null;

    if (!tenantId) {
      return res.status(404).json({ error: 'Área não encontrada' });
    }
    const areaCheck = await pool.query(
      `SELECT pa.id FROM project_areas pa
       INNER JOIN projects p ON pa.project_id = p.id
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
       WHERE pa.id = $2 AND pa.project_id = $3`,
      [tenantId, areaId, projectId]
    );
    if (areaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Área não encontrada' });
    }

    let sql = `SELECT ${TASK_SELECT}
       FROM project_tasks
       WHERE project_id = $1 AND area_id = $2`;
    const params: unknown[] = [projectId, areaId];
    sql = await appendProjectTaskVersionFilter(sql, params, versionIdRaw, projectId);
    sql += ' ORDER BY list_id, created_at ASC';

    const result = await pool.query(sql, params);

    res.json(result.rows.map(mapTaskRow));
  } catch (error) {
    console.error('Error fetching tasks by area:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefas da área' });
  }
};

const moveTaskSchema = z.object({
  list_id: z.string().uuid(),
  version_id: z.union([z.string().uuid(), z.null()]).optional(),
  area_id: z.union([z.string().uuid(), z.null()]).optional(),
});

// PATCH /api/projects/tasks/:taskId/move
export const moveProjectTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { taskId } = req.params;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const taskRow = await pool.query(
      `SELECT t.user_id, t.assignee_id, t.project_id, t.version_id, p.project_type ${TASK_ACCESS_WHERE}`,
      [taskId, userId]
    );
    if (taskRow.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    await assertModulePermission(userId, MODULE_TASKS, 'edit', {
      ownerId: taskRow.rows[0].user_id,
      assigneeId: taskRow.rows[0].assignee_id,
    }, req as AuthRequest);

    const validated = moveTaskSchema.parse(req.body);
    const projectId = taskRow.rows[0].project_id as string;
    const projectType = taskRow.rows[0].project_type as string;
    const currentVersionId = taskRow.rows[0].version_id as string | null;

    if (projectAllowsVersions(projectType) && await isProjectVersionFrozen(projectId, currentVersionId)) {
      return res.status(400).json({ error: 'Não é possível mover tarefa de versão congelada' });
    }

    if (!(await assertListInProject(validated.list_id, projectId))) {
      return res.status(400).json({ error: 'Lista não pertence ao projeto da tarefa' });
    }

    let nextVersionId: string | null | undefined = validated.version_id;
    if (nextVersionId !== undefined) {
      if (nextVersionId && !projectAllowsVersions(projectType)) {
        return res.status(400).json({ error: 'Este tipo de projeto não aceita versão em tarefas' });
      }
      if (nextVersionId && !(await assertVersionInProject(nextVersionId, projectId))) {
        return res.status(400).json({ error: 'Versão não pertence ao projeto' });
      }
      if (nextVersionId && await isProjectVersionFrozen(projectId, nextVersionId)) {
        return res.status(400).json({ error: 'Não é possível mover tarefa para versão congelada' });
      }
    }

    let nextAreaId: string | null | undefined = validated.area_id;
    if (nextAreaId !== undefined) {
      if (nextAreaId && !projectAllowsAreas(projectType)) {
        return res.status(400).json({ error: 'Este tipo de projeto não aceita área em tarefas' });
      }
      if (nextAreaId && !(await assertAreaInProject(nextAreaId, projectId))) {
        return res.status(400).json({ error: 'Área não pertence ao projeto' });
      }
    }

    const updates: string[] = ['list_id = $1', 'updated_at = now()'];
    const values: unknown[] = [validated.list_id];
    if (nextVersionId !== undefined) {
      updates.push(`version_id = $${values.length + 1}`);
      values.push(nextVersionId);
    }
    if (nextAreaId !== undefined) {
      updates.push(`area_id = $${values.length + 1}`);
      values.push(nextAreaId);
    }
    values.push(taskId);

    const result = await pool.query(
      `UPDATE project_tasks
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING ${TASK_SELECT}`,
      values,
    );

    console.info('[project-task-moved]', { taskId, projectId });
    res.json(mapTaskRow(result.rows[0]));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error moving project task:', error);
    res.status(500).json({ error: 'Erro ao mover tarefa' });
  }
};

const copyTaskSchema = z.object({
  version_id: z.string().uuid(),
  list_id: z.string().uuid(),
  area_id: z.union([z.string().uuid(), z.null()]).optional(),
  copy_checklist: z.boolean().default(true),
  copy_assignee: z.boolean().default(true),
  copy_due_date: z.boolean().default(true),
  copy_metadata: z.boolean().default(true),
});

// POST /api/projects/tasks/:taskId/copy
export const copyProjectTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { taskId } = req.params;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    try {
      await assertPermissionKey(userId, 'tasks.view', req as AuthRequest);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      throw e;
    }
    await assertModulePermission(userId, MODULE_TASKS, 'create', undefined, req as AuthRequest);

    const taskRow = await pool.query(
      `SELECT t.user_id, t.assignee_id, t.project_id, t.version_id, p.user_id AS project_owner_id, p.project_type
       ${TASK_ACCESS_WHERE}`,
      [taskId, userId],
    );
    if (taskRow.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const access = taskRow.rows[0];
    const projectId = access.project_id as string;
    const projectType = access.project_type as string;
    const currentVersionId = access.version_id as string | null;
    await assertModulePermission(userId, MODULE_PROJECTS, 'view', {
      ownerId: access.project_owner_id,
    }, req as AuthRequest);

    const validated = copyTaskSchema.parse(req.body);
    if (!(await assertListInProject(validated.list_id, projectId))) {
      return res.status(400).json({ error: 'Lista não pertence ao projeto da tarefa' });
    }
    if (!projectAllowsVersions(projectType)) {
      return res.status(400).json({ error: 'Este tipo de projeto não aceita versão em tarefas' });
    }
    if (!(await assertVersionInProject(validated.version_id, projectId))) {
      return res.status(400).json({ error: 'Versão não pertence ao projeto' });
    }
    if (await isProjectVersionFrozen(projectId, currentVersionId)) {
      return res.status(400).json({ error: 'Não é possível copiar tarefa de versão congelada' });
    }
    if (await isProjectVersionFrozen(projectId, validated.version_id)) {
      return res.status(400).json({ error: 'Não é possível copiar tarefa para versão congelada' });
    }

    let nextAreaId = validated.area_id ?? null;
    if (nextAreaId && !projectAllowsAreas(projectType)) {
      return res.status(400).json({ error: 'Este tipo de projeto não aceita área em tarefas' });
    }
    if (nextAreaId && !(await assertAreaInProject(nextAreaId, projectId))) {
      return res.status(400).json({ error: 'Área não pertence ao projeto' });
    }

    const sourceResult = await pool.query(`SELECT ${TASK_SELECT} FROM project_tasks WHERE id = $1`, [taskId]);
    if (sourceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    const source = sourceResult.rows[0];

    const sameDestination =
      (source.version_id ?? null) === validated.version_id &&
      source.list_id === validated.list_id &&
      (source.area_id ?? null) === nextAreaId;
    const title = sameDestination ? `${source.title} (cópia)` : source.title;

    const result = await pool.query(
      `INSERT INTO project_tasks (
        list_id, project_id, user_id, area_id, version_id, title, description, status, priority, due_date, assignee_id,
        tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
        checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
        milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
        budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
        include_in_release_notes, release_note_type
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17,
        $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23::jsonb,
        $24, $25, $26, $27, $28, $29, $30, $31, $32::jsonb, $33, $34, $35, $36, $37
      )
      RETURNING ${TASK_SELECT}`,
      [
        validated.list_id,
        projectId,
        userId,
        nextAreaId,
        validated.version_id,
        title,
        source.description || null,
        source.status,
        source.priority,
        validated.copy_due_date ? source.due_date || null : null,
        validated.copy_assignee ? source.assignee_id || null : null,
        JSON.stringify(validated.copy_metadata ? source.tags || [] : []),
        validated.copy_metadata ? source.start_date || null : null,
        validated.copy_metadata ? source.start_time || null : null,
        validated.copy_metadata ? source.end_time || null : null,
        validated.copy_metadata && source.estimated_effort_hours != null
          ? parseFloat(source.estimated_effort_hours)
          : null,
        validated.copy_metadata && source.estimated_story_points != null
          ? parseFloat(source.estimated_story_points)
          : null,
        JSON.stringify(validated.copy_checklist ? source.checklist || [] : []),
        JSON.stringify(validated.copy_metadata ? source.attachments || [] : []),
        JSON.stringify(validated.copy_metadata ? source.dependencies || [] : []),
        JSON.stringify(validated.copy_metadata ? source.watchers || [] : []),
        JSON.stringify(validated.copy_metadata ? source.reminders || [] : []),
        validated.copy_metadata ? formatJsonbForDb(source.recurrence_rule) : null,
        validated.copy_metadata ? source.milestone_id || null : null,
        null,
        validated.copy_metadata ? source.sprint_id || null : null,
        validated.copy_metadata ? source.visibility || 'internal' : 'internal',
        validated.copy_metadata ? Boolean(source.billable) : false,
        validated.copy_metadata && source.hourly_rate != null ? parseFloat(source.hourly_rate) : null,
        validated.copy_metadata && source.budget_cap != null ? parseFloat(source.budget_cap) : null,
        JSON.stringify(validated.copy_metadata ? source.custom_fields || {} : {}),
        validated.copy_metadata ? source.severity || null : null,
        validated.copy_metadata ? source.task_type || 'task' : 'task',
        validated.copy_metadata ? source.meeting_location || null : null,
        validated.copy_metadata ? source.meeting_link || null : null,
        source.include_in_release_notes ?? true,
        source.release_note_type || null,
      ],
    );

    console.info('[project-task-copied]', { taskId, projectId, newTaskId: result.rows[0].id });
    res.status(201).json(mapTaskRow(result.rows[0]));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error copying project task:', error);
    res.status(500).json({ error: 'Erro ao copiar tarefa' });
  }
};


