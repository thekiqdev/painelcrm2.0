import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

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
});

// GET /api/projects/lists/:listId/tasks
export const getProjectTasks = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { listId } = req.params;

    // Verificar se a lista pertence a um projeto do usuário
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

    const result = await pool.query(
      `SELECT id, list_id, project_id, title, description, status, priority, due_date, assignee_id,
              tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
              checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
              milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
              budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
              created_at, updated_at
       FROM project_tasks
       WHERE list_id = $1
       ORDER BY created_at ASC`,
      [listId]
    );

    const tasks = result.rows.map(task => ({
      ...task,
      tags: Array.isArray(task.tags) ? task.tags : [],
      checklist: Array.isArray(task.checklist) ? task.checklist : [],
      attachments: Array.isArray(task.attachments) ? task.attachments : [],
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
      watchers: Array.isArray(task.watchers) ? task.watchers : [],
      reminders: Array.isArray(task.reminders) ? task.reminders : [],
      custom_fields: task.custom_fields || {},
      due_date: task.due_date ? new Date(task.due_date).toISOString() : null,
      start_date: task.start_date ? new Date(task.start_date).toISOString() : null,
      estimated_effort_hours: task.estimated_effort_hours ? parseFloat(task.estimated_effort_hours) : null,
      estimated_story_points: task.estimated_story_points ? parseFloat(task.estimated_story_points) : null,
      hourly_rate: task.hourly_rate ? parseFloat(task.hourly_rate) : null,
      budget_cap: task.budget_cap ? parseFloat(task.budget_cap) : null,
    }));

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching project tasks:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefas' });
  }
};

// GET /api/projects/tasks/:taskId
export const getProjectTaskById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;

    // Verificar se a tarefa pertence a um projeto do usuário
    const taskCheck = await pool.query(
      `SELECT t.id
       FROM project_tasks t
       INNER JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND p.user_id = $2`,
      [taskId, userId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const result = await pool.query(
      `SELECT id, list_id, project_id, title, description, status, priority, due_date, assignee_id,
              tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
              checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
              milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
              budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
              created_at, updated_at
       FROM project_tasks
       WHERE id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const task = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
      checklist: Array.isArray(result.rows[0].checklist) ? result.rows[0].checklist : [],
      attachments: Array.isArray(result.rows[0].attachments) ? result.rows[0].attachments : [],
      dependencies: Array.isArray(result.rows[0].dependencies) ? result.rows[0].dependencies : [],
      watchers: Array.isArray(result.rows[0].watchers) ? result.rows[0].watchers : [],
      reminders: Array.isArray(result.rows[0].reminders) ? result.rows[0].reminders : [],
      custom_fields: result.rows[0].custom_fields || {},
      due_date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString() : null,
      start_date: result.rows[0].start_date ? new Date(result.rows[0].start_date).toISOString() : null,
      estimated_effort_hours: result.rows[0].estimated_effort_hours ? parseFloat(result.rows[0].estimated_effort_hours) : null,
      estimated_story_points: result.rows[0].estimated_story_points ? parseFloat(result.rows[0].estimated_story_points) : null,
      hourly_rate: result.rows[0].hourly_rate ? parseFloat(result.rows[0].hourly_rate) : null,
      budget_cap: result.rows[0].budget_cap ? parseFloat(result.rows[0].budget_cap) : null,
    };

    res.json(task);
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

    const result = await pool.query(
      `INSERT INTO project_tasks (
        list_id, project_id, user_id, title, description, status, priority, due_date, assignee_id,
        tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
        checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
        milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
        budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15,
        $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb,
        $22, $23, $24, $25, $26, $27, $28, $29::jsonb, $30, $31, $32, $33
      )
      RETURNING id, list_id, project_id, title, description, status, priority, due_date, assignee_id,
                tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
                checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
                milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
                budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
                created_at, updated_at`,
      [
        listId,
        projectId,
        userId,
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
        validated.recurrence_rule ? JSON.stringify(validated.recurrence_rule) : null,
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

    const task = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
      checklist: Array.isArray(result.rows[0].checklist) ? result.rows[0].checklist : [],
      attachments: Array.isArray(result.rows[0].attachments) ? result.rows[0].attachments : [],
      dependencies: Array.isArray(result.rows[0].dependencies) ? result.rows[0].dependencies : [],
      watchers: Array.isArray(result.rows[0].watchers) ? result.rows[0].watchers : [],
      reminders: Array.isArray(result.rows[0].reminders) ? result.rows[0].reminders : [],
      custom_fields: result.rows[0].custom_fields || {},
      due_date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString() : null,
      start_date: result.rows[0].start_date ? new Date(result.rows[0].start_date).toISOString() : null,
      estimated_effort_hours: result.rows[0].estimated_effort_hours ? parseFloat(result.rows[0].estimated_effort_hours) : null,
      estimated_story_points: result.rows[0].estimated_story_points ? parseFloat(result.rows[0].estimated_story_points) : null,
      hourly_rate: result.rows[0].hourly_rate ? parseFloat(result.rows[0].hourly_rate) : null,
      budget_cap: result.rows[0].budget_cap ? parseFloat(result.rows[0].budget_cap) : null,
    };

    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating project task:', error);
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
};

// PATCH /api/projects/tasks/:taskId
export const updateProjectTask = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;

    const validated = taskSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Construir updates dinamicamente
    const fieldMappings: Record<string, any> = {
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
      recurrence_rule: validated.recurrence_rule ? JSON.stringify(validated.recurrence_rule) : undefined,
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

    // Verificar se a tarefa pertence a um projeto do usuário
    const taskCheck = await pool.query(
      `SELECT t.id
       FROM project_tasks t
       INNER JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND p.user_id = $2`,
      [taskId, userId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    values.push(taskId);
    const result = await pool.query(
      `UPDATE project_tasks
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount}
       RETURNING id, list_id, project_id, title, description, status, priority, due_date, assignee_id,
                tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
                checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
                milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
                budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
                created_at, updated_at`,
      values
    );

    const task = {
      ...result.rows[0],
      tags: Array.isArray(result.rows[0].tags) ? result.rows[0].tags : [],
      checklist: Array.isArray(result.rows[0].checklist) ? result.rows[0].checklist : [],
      attachments: Array.isArray(result.rows[0].attachments) ? result.rows[0].attachments : [],
      dependencies: Array.isArray(result.rows[0].dependencies) ? result.rows[0].dependencies : [],
      watchers: Array.isArray(result.rows[0].watchers) ? result.rows[0].watchers : [],
      reminders: Array.isArray(result.rows[0].reminders) ? result.rows[0].reminders : [],
      custom_fields: result.rows[0].custom_fields || {},
      due_date: result.rows[0].due_date ? new Date(result.rows[0].due_date).toISOString() : null,
      start_date: result.rows[0].start_date ? new Date(result.rows[0].start_date).toISOString() : null,
      estimated_effort_hours: result.rows[0].estimated_effort_hours ? parseFloat(result.rows[0].estimated_effort_hours) : null,
      estimated_story_points: result.rows[0].estimated_story_points ? parseFloat(result.rows[0].estimated_story_points) : null,
      hourly_rate: result.rows[0].hourly_rate ? parseFloat(result.rows[0].hourly_rate) : null,
      budget_cap: result.rows[0].budget_cap ? parseFloat(result.rows[0].budget_cap) : null,
    };

    res.json(task);
  } catch (error) {
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

    // Verificar se a tarefa pertence a um projeto do usuário
    const taskCheck = await pool.query(
      `SELECT t.id
       FROM project_tasks t
       INNER JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND p.user_id = $2`,
      [taskId, userId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    await pool.query(
      `DELETE FROM project_tasks WHERE id = $1`,
      [taskId]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project task:', error);
    res.status(500).json({ error: 'Erro ao deletar tarefa' });
  }
};


