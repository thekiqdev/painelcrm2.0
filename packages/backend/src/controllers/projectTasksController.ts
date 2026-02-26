import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';
import { assertModulePermission, ModulePermissionError } from '../services/modulePermissionsService.js';

const MODULE_TASKS = 'tasks';

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
  list_id: z.string().uuid().optional().nullable(),
});

const TASK_SELECT = `id, list_id, project_id, area_id, title, description, status, priority, due_date, assignee_id,
  tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
  checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
  milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
  budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
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

// GET /api/projects/lists/:listId/tasks?areaId=uuid (areaId opcional: filtra por área)
export const getProjectTasks = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { listId } = req.params;
    const areaId = (req.query.areaId as string) || null;

    const listCheck = await pool.query(
      `SELECT pl.id, pl.project_id
       FROM project_lists pl
       INNER JOIN projects p ON pl.project_id = p.id
       WHERE pl.id = $1 AND p.user_id = $2`,
      [listId, userId]
    );

    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    let result;
    if (areaId) {
      result = await pool.query(
        `SELECT ${TASK_SELECT}
         FROM project_tasks
         WHERE list_id = $1 AND area_id = $2
         ORDER BY created_at ASC`,
        [listId, areaId]
      );
    } else {
      result = await pool.query(
        `SELECT ${TASK_SELECT}
         FROM project_tasks
         WHERE list_id = $1
         ORDER BY created_at ASC`,
        [listId]
      );
    }

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
    const { listId } = req.params;
    await assertModulePermission(userId, MODULE_TASKS, 'create');

    // Verificar se a lista pertence a um projeto do usuário e obter project_id
    const listCheck = await pool.query(
      `SELECT pl.id, pl.project_id
       FROM project_lists pl
       INNER JOIN projects p ON pl.project_id = p.id
       WHERE pl.id = $1 AND p.user_id = $2`,
      [listId, userId]
    );

    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const projectId = listCheck.rows[0].project_id;
    const validated = taskSchema.parse(req.body);
    const areaId = validated.area_id ?? null;

    const result = await pool.query(
      `INSERT INTO project_tasks (
        list_id, project_id, user_id, area_id, title, description, status, priority, due_date, assignee_id,
        tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
        checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
        milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
        budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16,
        $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb,
        $23, $24, $25, $26, $27, $28, $29, $30, $31::jsonb, $32, $33, $34
      )
      RETURNING ${TASK_SELECT}`,
      [
        listId,
        projectId,
        userId,
        areaId,
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
    });
    const validated = taskSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Construir updates dinamicamente
    const fieldMappings: Record<string, any> = {
      list_id: validated.list_id,
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

    const taskCheck = await pool.query(
      `SELECT t.id, t.project_id ${TASK_ACCESS_WHERE}`,
      [taskId, userId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    if (validated.list_id) {
      const listCheck = await pool.query(
        `SELECT id FROM project_lists WHERE id = $1 AND project_id = $2`,
        [validated.list_id, taskCheck.rows[0].project_id]
      );
      if (listCheck.rows.length === 0) {
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
    });
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
    const userId = (req as any).userId;
    const { projectId, areaId } = req.params;

    const areaCheck = await pool.query(
      `SELECT pa.id FROM project_areas pa
       INNER JOIN projects p ON pa.project_id = p.id
       WHERE pa.id = $1 AND pa.project_id = $2 AND p.user_id = $3`,
      [areaId, projectId, userId]
    );
    if (areaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Área não encontrada' });
    }

    const result = await pool.query(
      `SELECT ${TASK_SELECT}
       FROM project_tasks
       WHERE project_id = $1 AND area_id = $2
       ORDER BY list_id, created_at ASC`,
      [projectId, areaId]
    );

    res.json(result.rows.map(mapTaskRow));
  } catch (error) {
    console.error('Error fetching tasks by area:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefas da área' });
  }
};


