import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import {
  assertModulePermission,
  assertPermissionKey,
  ModulePermissionError,
} from '../permissions/index.js';
import { resolveTasksGranularFromLegacy } from '../permissions/permissionCatalog.js';
import {
  listUnifiedTasks,
  normalizeTaskStatus,
  summarizeUnifiedTasks,
} from '../services/tasks/unifiedTasksService.js';
import type { UnifiedTaskDto, UnifiedTaskListFilters } from '../services/tasks/unifiedTaskTypes.js';

const MODULE_TASKS = 'tasks';

const taskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  due_time: z.string().optional().nullable(),
  status: z
    .enum(['pending', 'completed', 'in_progress', 'waiting'])
    .default('pending'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  client_id: z.string().uuid().optional().nullable(),
  client_name: z.string().optional().nullable(),
  deal: z.string().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  assignee_name: z.string().optional().nullable(),
  checklist: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        completed: z.boolean(),
      })
    )
    .default([]),
});

function formatTaskRow(task: Record<string, unknown>) {
  return {
    ...task,
    checklist: Array.isArray(task.checklist) ? task.checklist : [],
    date: task.due_date ? new Date(task.due_date as string).toISOString().split('T')[0] : null,
    time: task.due_time || null,
    client: task.client_name || null,
    assignee: task.assignee_name || null,
    assigneeAvatar: task.assignee_name
      ? String(task.assignee_name)
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase()
      : null,
  };
}

/** Resposta POST /api/tasks alinhada ao GET unificado (tarefa avulsa). */
function formatCreatedStandaloneTask(row: Record<string, unknown>): Record<string, unknown> {
  const base = formatTaskRow(row);
  const id = String(row.id ?? '');
  const status = String(row.status ?? '');
  return {
    ...base,
    origin: 'standalone',
    origin_id: id,
    normalized_status: normalizeTaskStatus(status, 'standalone'),
    project_id: null,
    project_name: null,
    lead_id: null,
    lead_name: null,
  };
}

/** Nome exibido do responsável a partir do perfil (mesmo tenant). */
async function resolveAssigneeDisplayName(
  assigneeId: string | null,
  tenantId: string | null,
  fallback: string | null | undefined,
): Promise<string | null> {
  const fb = fallback && String(fallback).trim() ? String(fallback).trim() : null;
  if (!assigneeId || !tenantId) return fb;
  const r = await pool.query<{ n: string | null }>(
    `SELECT NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '')::text AS n
     FROM profiles p
     INNER JOIN users u ON u.id = p.id AND u.tenant_id = $2::uuid
     WHERE p.id = $1::uuid
     LIMIT 1`,
    [assigneeId, tenantId],
  );
  const n = r.rows[0]?.n;
  if (n && String(n).trim()) return String(n).trim();
  return fb;
}

function formatUnifiedTaskApiRow(dto: UnifiedTaskDto): Record<string, unknown> {
  const checklist = Array.isArray(dto.checklist) ? dto.checklist : [];
  const assigneeName = dto.assignee_name;
  const legacyDate =
    dto.due_date ?? (dto.due_at ? dto.due_at.slice(0, 10) : null);
  return {
    ...dto,
    checklist,
    date: legacyDate,
    time: dto.due_time,
    client: dto.client_name ?? null,
    assignee: assigneeName,
    assigneeAvatar: assigneeName
      ? String(assigneeName)
          .split(' ')
          .filter(Boolean)
          .map((n: string) => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase()
      : null,
  };
}

function parseOptionalInt(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseUnifiedTaskQuery(req: Request): UnifiedTaskListFilters {
  const q = req.query;
  const one = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const limitRaw = parseOptionalInt(q.limit);
  const offsetRaw = parseOptionalInt(q.offset);
  let limit: number | undefined;
  let offset: number | undefined;
  if (limitRaw !== undefined) {
    limit = Math.min(Math.max(limitRaw, 1), 200);
    offset = offsetRaw !== undefined ? Math.max(offsetRaw, 0) : 0;
  }

  return {
    scope: one(q.scope),
    origin: one(q.origin),
    project_id: one(q.project_id),
    client_id: one(q.client_id),
    lead_id: one(q.lead_id),
    status: one(q.status),
    normalized_status: one(q.normalized_status),
    due: one(q.due) as UnifiedTaskListFilters['due'],
    q: one(q.q),
    sort: one(q.sort),
    date: one(q.date),
    clientId: one(q.clientId),
    limit,
    offset,
  };
}

/** Próprio = criador ou responsável atribuído. */
function taskParticipant(row: { user_id: string; assignee_id: string | null }, viewerId: string): boolean {
  return row.user_id === viewerId || (row.assignee_id != null && row.assignee_id === viewerId);
}

/** GET /api/tasks — listagem unificada (tasks + project_tasks + client_tasks + lead_tasks). Use unified=0 só para legado. */
export const getTasks = async (req: Request, res: Response) => {
  try {
    const reqAuth = req as AuthRequest;
    const tenantId = reqAuth.tenantId ?? null;
    if (!tenantId) {
      return res.json([]);
    }
    const userId = reqAuth.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    let permMap;
    try {
      permMap = await assertPermissionKey(userId, 'tasks.view', reqAuth);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      throw e;
    }

    const tg = resolveTasksGranularFromLegacy(permMap);
    const legacyOnly = req.query.unified === '0';

    if (legacyOnly) {
      const { status, date, clientId } = req.query;
      let query = `
      SELECT t.id, t.user_id, t.title, t.description, t.due_date, t.due_time, t.status, t.priority,
             t.client_id, t.client_name, t.deal, t.assignee_id, t.assignee_name,
             t.checklist, t.created_at, t.updated_at
      FROM tasks t
      INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1
      WHERE 1=1
    `;
      const params: unknown[] = [tenantId];
      let paramCount = 1;

      if (tg.view_own && !tg.view_all) {
        paramCount++;
        query += ` AND (t.user_id = $${paramCount} OR t.assignee_id = $${paramCount})`;
        params.push(userId);
      }

      if (status) {
        paramCount++;
        query += ` AND t.status = $${paramCount}`;
        params.push(status);
      }

      if (date) {
        paramCount++;
        query += ` AND t.due_date = $${paramCount}`;
        params.push(date);
      }

      if (clientId) {
        paramCount++;
        query += ` AND t.client_id = $${paramCount}`;
        params.push(clientId);
      }

      query += ` ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`;

      const result = await pool.query(query, params);
      const tasks = result.rows.map((task) => formatTaskRow(task as Record<string, unknown>));
      res.json(tasks);
      return;
    }

    const filters = parseUnifiedTaskQuery(req);
    const rows = await listUnifiedTasks({
      tenantId,
      userId,
      filters,
      permissions: { viewAll: tg.view_all },
    });
    res.json(rows.map(formatUnifiedTaskApiRow));
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefas' });
  }
};

/** GET /api/tasks/summary — contagens rápidas (escopo “minhas”). */
export const getTasksSummary = async (req: Request, res: Response) => {
  try {
    const reqAuth = req as AuthRequest;
    const tenantId = reqAuth.tenantId ?? null;
    const userId = reqAuth.userId;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    let permMap;
    try {
      permMap = await assertPermissionKey(userId, 'tasks.view', reqAuth);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      throw e;
    }

    const tg = resolveTasksGranularFromLegacy(permMap);
    const summary = await summarizeUnifiedTasks({
      tenantId,
      userId,
      permissions: { viewAll: tg.view_all },
    });
    res.json(summary);
  } catch (error) {
    console.error('Error fetching tasks summary:', error);
    res.status(500).json({ error: 'Erro ao carregar resumo de tarefas' });
  }
};

/** GET /api/tasks/:id */
export const getTaskById = async (req: Request, res: Response) => {
  try {
    const reqAuth = req as AuthRequest;
    const userId = reqAuth.userId;
    const { id } = req.params;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    let permMap;
    try {
      permMap = await assertPermissionKey(userId, 'tasks.view', reqAuth);
    } catch (e) {
      if (e instanceof ModulePermissionError) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      throw e;
    }
    const tg = resolveTasksGranularFromLegacy(permMap);

    const result = await pool.query<{
      user_id: string;
      assignee_id: string | null;
      [key: string]: unknown;
    }>(
      `SELECT t.id, t.user_id, t.title, t.description, t.due_date, t.due_time, t.status, t.priority,
              t.client_id, t.client_name, t.deal, t.assignee_id, t.assignee_name,
              t.checklist, t.created_at, t.updated_at
       FROM tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE t.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const row = result.rows[0];
    if (tg.view_own && !tg.view_all && !taskParticipant(row, userId)) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.json(formatTaskRow(row as Record<string, unknown>));
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Erro ao buscar tarefa' });
  }
};

/** POST /api/tasks */
export const createTask = async (req: Request, res: Response) => {
  try {
    const reqAuth = req as AuthRequest;
    const userId = reqAuth.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    await assertPermissionKey(userId, 'tasks.create', reqAuth);
    const validated = taskSchema.parse(req.body);
    const tenantId = reqAuth.tenantId ?? null;
    const assigneeNameResolved = await resolveAssigneeDisplayName(
      validated.assignee_id ?? null,
      tenantId,
      validated.assignee_name ?? null,
    );

    const result = await pool.query(
      `INSERT INTO tasks (
        user_id, title, description, due_date, due_time, status, priority,
        client_id, client_name, deal, assignee_id, assignee_name, checklist
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING id, user_id, title, description, due_date, due_time, status, priority,
                client_id, client_name, deal, assignee_id, assignee_name,
                checklist, created_at, updated_at`,
      [
        userId,
        validated.title,
        validated.description || null,
        validated.due_date || null,
        validated.due_time || null,
        validated.status,
        validated.priority,
        validated.client_id || null,
        validated.client_name || null,
        validated.deal || null,
        validated.assignee_id || null,
        assigneeNameResolved,
        JSON.stringify(validated.checklist || []),
      ]
    );

    res.status(201).json(formatCreatedStandaloneTask(result.rows[0] as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
};

/** PATCH /api/tasks/:id */
export const updateTask = async (req: Request, res: Response) => {
  try {
    const reqAuth = req as AuthRequest;
    const userId = reqAuth.userId;
    const { id } = req.params;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const existing = await pool.query<{
      user_id: string;
      assignee_id: string | null;
      assignee_name: string | null;
    }>(
      `SELECT t.user_id, t.assignee_id, t.assignee_name
       FROM tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE t.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const row = existing.rows[0];
    await assertModulePermission(
      userId,
      MODULE_TASKS,
      'edit',
      { ownerId: row.user_id, assigneeId: row.assignee_id },
      reqAuth
    );

    const validated = taskSchema.partial().parse(req.body);
    const tenantId = reqAuth.tenantId ?? null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (validated.title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(validated.title);
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(validated.description || null);
    }
    if (validated.due_date !== undefined) {
      updates.push(`due_date = $${paramCount++}`);
      values.push(validated.due_date || null);
    }
    if (validated.due_time !== undefined) {
      updates.push(`due_time = $${paramCount++}`);
      values.push(validated.due_time || null);
    }
    if (validated.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(validated.status);
    }
    if (validated.priority !== undefined) {
      updates.push(`priority = $${paramCount++}`);
      values.push(validated.priority);
    }
    if (validated.client_id !== undefined) {
      updates.push(`client_id = $${paramCount++}`);
      values.push(validated.client_id || null);
    }
    if (validated.client_name !== undefined) {
      updates.push(`client_name = $${paramCount++}`);
      values.push(validated.client_name || null);
    }
    if (validated.deal !== undefined) {
      updates.push(`deal = $${paramCount++}`);
      values.push(validated.deal || null);
    }
    if (validated.assignee_id !== undefined) {
      updates.push(`assignee_id = $${paramCount++}`);
      values.push(validated.assignee_id || null);
      const nameForPair =
        validated.assignee_name !== undefined
          ? validated.assignee_name || null
          : await resolveAssigneeDisplayName(validated.assignee_id || null, tenantId, row.assignee_name);
      updates.push(`assignee_name = $${paramCount++}`);
      values.push(nameForPair);
    } else if (validated.assignee_name !== undefined) {
      updates.push(`assignee_name = $${paramCount++}`);
      values.push(validated.assignee_name || null);
    }
    if (validated.checklist !== undefined) {
      updates.push(`checklist = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.checklist));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id);
    const tenantParam = paramCount + 1;
    const result = await pool.query(
      `UPDATE tasks
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount}
         AND EXISTS (
           SELECT 1 FROM tasks tk
           INNER JOIN users u ON u.id = tk.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $${tenantParam})
           WHERE tk.id = tasks.id
         )
       RETURNING id, user_id, title, description, due_date, due_time, status, priority,
                 client_id, client_name, deal, assignee_id, assignee_name,
                 checklist, created_at, updated_at`,
      [...values, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.json(formatCreatedStandaloneTask(result.rows[0] as Record<string, unknown>));
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
};

/** DELETE /api/tasks/:id */
export const deleteTask = async (req: Request, res: Response) => {
  try {
    const reqAuth = req as AuthRequest;
    const userId = reqAuth.userId;
    const { id } = req.params;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const existing = await pool.query<{
      user_id: string;
      assignee_id: string | null;
    }>(
      `SELECT t.user_id, t.assignee_id
       FROM tasks t
       INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE t.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const row = existing.rows[0];
    await assertModulePermission(
      userId,
      MODULE_TASKS,
      'delete',
      { ownerId: row.user_id, assigneeId: row.assignee_id },
      reqAuth
    );

    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1
         AND EXISTS (
           SELECT 1 FROM tasks tk
           INNER JOIN users u ON u.id = tk.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
           WHERE tk.id = tasks.id
         )
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Erro ao deletar tarefa' });
  }
};
