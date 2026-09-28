import { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  loadProjectInTenant,
  projectAllowsVersions,
} from '../services/projectVersionsScope.js';
import {
  COMPLETED_PROJECT_TASK_STATUS_SQL,
  OPEN_PROJECT_TASK_STATUS_SQL,
} from '../services/projectTaskStatus.js';

const MODULE_PROJECTS = 'projects';

const VERSION_STATUSES = ['planning', 'development', 'qa', 'published', 'archived'] as const;
const RELEASE_NOTE_TYPES = ['feature', 'fix', 'improvement', 'internal'] as const;
const VERSION_TASK_JOIN = `t.project_id = pv.project_id AND (
        t.version_id = pv.id
        OR (pv.is_default = true AND t.version_id IS NULL)
      )`;

function normalizeVersionStatus(status: unknown): unknown {
  if (status === 'planned') return 'planning';
  if (status === 'in_progress') return 'development';
  if (status === 'released') return 'published';
  return status;
}

const versionStatusSchema = z.preprocess(normalizeVersionStatus, z.enum(VERSION_STATUSES));

const createVersionSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  status: versionStatusSchema.optional().default('planning'),
});

const updateVersionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: versionStatusSchema.optional(),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  release_date: z.string().optional().nullable(),
  is_default: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
  release_notes: z.string().optional().nullable(),
  frozen: z.boolean().optional(),
});

const publishVersionSchema = z.object({
  move_incomplete_to_version_id: z.string().uuid().optional().nullable(),
  archive_after_publish: z.boolean().optional().default(false),
  freeze_version: z.boolean().optional().default(true),
  generate_release_notes: z.boolean().optional().default(true),
});

const duplicateVersionSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  copy_open_tasks: z.boolean().optional().default(true),
  copy_completed_tasks: z.boolean().optional().default(false),
  copy_checklists: z.boolean().optional().default(true),
});

function mapVersionRow(row: any) {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    start_date: row.start_date ? new Date(row.start_date).toISOString().split('T')[0] : null,
    due_date: row.due_date ? new Date(row.due_date).toISOString().split('T')[0] : null,
    release_date: row.release_date ? new Date(row.release_date).toISOString() : null,
    is_default: Boolean(row.is_default),
    sort_order: row.sort_order,
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
    published_by: row.published_by ?? null,
    archived_at: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    archived_by: row.archived_by ?? null,
    release_notes: row.release_notes ?? null,
    frozen: Boolean(row.frozen),
    created_by: row.created_by ?? null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    metrics: {
      total_tasks: Number(row.total_tasks ?? 0),
      completed_tasks: Number(row.completed_tasks ?? 0),
      overdue_tasks: Number(row.overdue_tasks ?? 0),
      open_tasks: Number(row.open_tasks ?? 0),
      feature_tasks: Number(row.feature_tasks ?? 0),
      fix_tasks: Number(row.fix_tasks ?? 0),
      improvement_tasks: Number(row.improvement_tasks ?? 0),
      internal_tasks: Number(row.internal_tasks ?? 0),
      days_remaining: row.days_remaining != null ? Number(row.days_remaining) : null,
      ready_to_publish: Number(row.open_tasks ?? 0) === 0,
    },
  };
}

const VERSION_SELECT_WITH_METRICS = `
  pv.id,
  pv.project_id,
  pv.name,
  pv.description,
  pv.status,
  pv.start_date,
  pv.due_date,
  pv.release_date,
  pv.is_default,
  pv.sort_order,
  pv.published_at,
  pv.published_by,
  pv.archived_at,
  pv.archived_by,
  pv.release_notes,
  pv.frozen,
  pv.created_by,
  pv.created_at,
  pv.updated_at,
  COUNT(t.id)::int AS total_tasks,
  COUNT(t.id) FILTER (WHERE ${COMPLETED_PROJECT_TASK_STATUS_SQL})::int AS completed_tasks,
  COUNT(t.id) FILTER (
    WHERE t.due_date IS NOT NULL
      AND t.due_date < now()
      AND ${OPEN_PROJECT_TASK_STATUS_SQL}
  )::int AS overdue_tasks
  , COUNT(t.id) FILTER (WHERE ${OPEN_PROJECT_TASK_STATUS_SQL})::int AS open_tasks
  , COUNT(t.id) FILTER (WHERE COALESCE(t.release_note_type, 'feature') = 'feature')::int AS feature_tasks
  , COUNT(t.id) FILTER (WHERE t.release_note_type = 'fix')::int AS fix_tasks
  , COUNT(t.id) FILTER (WHERE t.release_note_type = 'improvement')::int AS improvement_tasks
  , COUNT(t.id) FILTER (WHERE t.release_note_type = 'internal')::int AS internal_tasks
  , CASE
      WHEN pv.due_date IS NULL THEN NULL
      ELSE CEIL(EXTRACT(EPOCH FROM (pv.due_date::timestamptz - now())) / 86400)::int
    END AS days_remaining
`;

async function loadVersionsForProject(projectId: string, includeArchived: boolean) {
  const archivedClause = includeArchived ? '' : 'AND pv.archived_at IS NULL';
  const result = await pool.query(
    `SELECT ${VERSION_SELECT_WITH_METRICS}
     FROM project_versions pv
     LEFT JOIN project_tasks t
       ON t.project_id = pv.project_id
      AND (
        t.version_id = pv.id
        OR (pv.is_default = true AND t.version_id IS NULL)
      )
     WHERE pv.project_id = $1 ${archivedClause}
     GROUP BY pv.id
     ORDER BY pv.sort_order ASC, pv.created_at ASC`,
    [projectId],
  );
  return result.rows.map(mapVersionRow);
}

async function loadVersionById(projectId: string, versionId: string) {
  const result = await pool.query(
    `SELECT ${VERSION_SELECT_WITH_METRICS}
     FROM project_versions pv
     LEFT JOIN project_tasks t
       ON ${VERSION_TASK_JOIN}
     WHERE pv.project_id = $1 AND pv.id = $2
     GROUP BY pv.id`,
    [projectId, versionId],
  );
  return result.rows[0] ? mapVersionRow(result.rows[0]) : null;
}

async function clearDefaultVersions(projectId: string, exceptVersionId?: string) {
  if (exceptVersionId) {
    await pool.query(
      `UPDATE project_versions SET is_default = false, updated_at = now()
       WHERE project_id = $1 AND id <> $2 AND is_default = true`,
      [projectId, exceptVersionId],
    );
    return;
  }
  await pool.query(
    `UPDATE project_versions SET is_default = false, updated_at = now()
     WHERE project_id = $1 AND is_default = true`,
    [projectId],
  );
}

export async function getProjectVersions(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { projectId } = req.params;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!tenantId) {
      res.json([]);
      return;
    }

    const project = await loadProjectInTenant(projectId, tenantId);
    if (!project) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    await assertModulePermission(userId, MODULE_PROJECTS, 'view', { ownerId: project.user_id }, req as AuthRequest);

    if (!projectAllowsVersions(project.project_type)) {
      res.json([]);
      return;
    }

    const includeArchived = req.query.includeArchived === 'true';
    const versions = await loadVersionsForProject(projectId, includeArchived);
    res.json(versions);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error fetching project versions:', error);
    res.status(500).json({ error: 'Erro ao buscar versões do projeto' });
  }
}

export async function createProjectVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { projectId } = req.params;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!tenantId) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    const project = await loadProjectInTenant(projectId, tenantId);
    if (!project) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    await assertModulePermission(userId, MODULE_PROJECTS, 'edit', { ownerId: project.user_id }, req as AuthRequest);

    if (!projectAllowsVersions(project.project_type)) {
      res.status(400).json({ error: 'Este tipo de projeto não possui versões' });
      return;
    }

    const validated = createVersionSchema.parse(req.body);
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM project_versions WHERE project_id = $1`,
      [projectId],
    );
    const existingCount = Number(countResult.rows[0]?.count ?? 0);
    const maxOrder = await pool.query<{ next_order: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_versions WHERE project_id = $1`,
      [projectId],
    );
    const sortOrder = maxOrder.rows[0]?.next_order ?? 0;
    const isDefault = existingCount === 0;

    if (isDefault) {
      await clearDefaultVersions(projectId);
    }

    const insert = await pool.query(
      `INSERT INTO project_versions (
         project_id, name, description, status, start_date, due_date, sort_order, is_default, created_by
       ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9)
       RETURNING id`,
      [
        projectId,
        validated.name.trim(),
        validated.description?.trim() || null,
        validated.status,
        validated.start_date || null,
        validated.due_date || null,
        sortOrder,
        isDefault,
        userId,
      ],
    );

    const version = await loadVersionById(projectId, insert.rows[0].id);
    console.info('[project-version-created]', { projectId, versionId: insert.rows[0].id });
    res.status(201).json(version);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating project version:', error);
    res.status(500).json({ error: 'Erro ao criar versão do projeto' });
  }
}

export async function updateProjectVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { projectId, versionId } = req.params;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!tenantId) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    const project = await loadProjectInTenant(projectId, tenantId);
    if (!project) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    await assertModulePermission(userId, MODULE_PROJECTS, 'edit', { ownerId: project.user_id }, req as AuthRequest);

    if (!projectAllowsVersions(project.project_type)) {
      res.status(400).json({ error: 'Este tipo de projeto não possui versões' });
      return;
    }

    const existing = await pool.query<{ id: string; status: string; frozen: boolean }>(
      `SELECT id, status, frozen FROM project_versions WHERE id = $1 AND project_id = $2`,
      [versionId, projectId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    const validated = updateVersionSchema.parse(req.body);
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(validated.name.trim());
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(validated.description?.trim() || null);
    }
    if (validated.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(validated.status);
    }
    if (validated.start_date !== undefined) {
      updates.push(`start_date = $${paramCount++}::date`);
      values.push(validated.start_date || null);
    }
    if (validated.due_date !== undefined) {
      updates.push(`due_date = $${paramCount++}::date`);
      values.push(validated.due_date || null);
    }
    if (validated.release_date !== undefined) {
      updates.push(`release_date = $${paramCount++}::timestamptz`);
      values.push(validated.release_date || null);
    }
    if (validated.sort_order !== undefined) {
      updates.push(`sort_order = $${paramCount++}`);
      values.push(validated.sort_order);
    }
    if (validated.release_notes !== undefined) {
      updates.push(`release_notes = $${paramCount++}`);
      values.push(validated.release_notes?.trim() || null);
    }
    if (validated.frozen !== undefined) {
      updates.push(`frozen = $${paramCount++}`);
      values.push(validated.frozen);
    }
    if (validated.is_default !== undefined) {
      updates.push(`is_default = $${paramCount++}`);
      values.push(validated.is_default);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar' });
      return;
    }

    if (validated.is_default === true) {
      await clearDefaultVersions(projectId, versionId);
    }

    values.push(versionId, projectId);
    await pool.query(
      `UPDATE project_versions
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount++} AND project_id = $${paramCount}`,
      values,
    );

    const version = await loadVersionById(projectId, versionId);
    console.info('[project-version-updated]', { projectId, versionId });
    if (validated.status !== undefined && validated.status !== existing.rows[0].status) {
      console.info('[project-version-status-changed]', {
        projectId,
        versionId,
        from: existing.rows[0].status,
        to: validated.status,
      });
    }
    if (validated.frozen === true && existing.rows[0].frozen !== true) {
      console.info('[project-version-frozen]', { projectId, versionId });
    }
    if (validated.frozen === false && existing.rows[0].frozen === true) {
      console.info('[project-version-unfrozen]', { projectId, versionId });
    }
    res.json(version);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating project version:', error);
    res.status(500).json({ error: 'Erro ao atualizar versão do projeto' });
  }
}

export async function archiveProjectVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { projectId, versionId } = req.params;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!tenantId) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    const project = await loadProjectInTenant(projectId, tenantId);
    if (!project) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    await assertModulePermission(userId, MODULE_PROJECTS, 'edit', { ownerId: project.user_id }, req as AuthRequest);

    const versionRow = await pool.query<{ is_default: boolean }>(
      `SELECT is_default FROM project_versions WHERE id = $1 AND project_id = $2`,
      [versionId, projectId],
    );
    if (versionRow.rows.length === 0) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    if (versionRow.rows[0].is_default) {
      const other = await pool.query(
        `SELECT id FROM project_versions
         WHERE project_id = $1 AND id <> $2 AND archived_at IS NULL
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 1`,
        [projectId, versionId],
      );
      if (other.rows.length > 0) {
        await clearDefaultVersions(projectId, other.rows[0].id);
        await pool.query(
          `UPDATE project_versions SET is_default = true, updated_at = now() WHERE id = $1`,
          [other.rows[0].id],
        );
      }
    }

    await pool.query(
      `UPDATE project_versions
       SET archived_at = now(),
           archived_by = $3,
           status = 'archived',
           is_default = false,
           updated_at = now()
       WHERE id = $1 AND project_id = $2`,
      [versionId, projectId, userId],
    );

    const version = await loadVersionById(projectId, versionId);
    console.info('[project-version-updated]', { projectId, versionId, archived: true });
    res.json(version);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error archiving project version:', error);
    res.status(500).json({ error: 'Erro ao arquivar versão do projeto' });
  }
}

export async function unarchiveProjectVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { projectId, versionId } = req.params;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!tenantId) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    const project = await loadProjectInTenant(projectId, tenantId);
    if (!project) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    await assertModulePermission(userId, MODULE_PROJECTS, 'edit', { ownerId: project.user_id }, req as AuthRequest);

    const versionRow = await pool.query<{ archived_at: Date | null; status: string }>(
      `SELECT archived_at, status FROM project_versions WHERE id = $1 AND project_id = $2`,
      [versionId, projectId],
    );
    if (versionRow.rows.length === 0) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }
    if (!versionRow.rows[0].archived_at) {
      res.status(400).json({ error: 'Esta versão não está arquivada' });
      return;
    }

    const restoredStatus = versionRow.rows[0].status === 'archived' ? 'planning' : versionRow.rows[0].status;

    await pool.query(
      `UPDATE project_versions
       SET archived_at = NULL,
           archived_by = NULL,
           status = $3,
           updated_at = now()
       WHERE id = $1 AND project_id = $2`,
      [versionId, projectId, restoredStatus],
    );

    const version = await loadVersionById(projectId, versionId);
    console.info('[project-version-updated]', { projectId, versionId, archived: false });
    res.json(version);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error unarchiving project version:', error);
    res.status(500).json({ error: 'Erro ao desarquivar versão do projeto' });
  }
}

export async function deleteProjectVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { projectId, versionId } = req.params;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!tenantId) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    const project = await loadProjectInTenant(projectId, tenantId);
    if (!project) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    await assertModulePermission(userId, MODULE_PROJECTS, 'edit', { ownerId: project.user_id }, req as AuthRequest);

    const taskCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM project_tasks WHERE version_id = $1`,
      [versionId],
    );
    if (Number(taskCount.rows[0]?.count ?? 0) > 0) {
      res.status(400).json({ error: 'Não é possível excluir versão com tarefas vinculadas' });
      return;
    }

    const result = await pool.query(
      `DELETE FROM project_versions WHERE id = $1 AND project_id = $2 RETURNING id`,
      [versionId, projectId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting project version:', error);
    res.status(500).json({ error: 'Erro ao excluir versão do projeto' });
  }
}

function normalizeReleaseNoteType(task: { release_note_type?: string | null; task_type?: string | null; tags?: string[] | null }): typeof RELEASE_NOTE_TYPES[number] {
  if (task.release_note_type && RELEASE_NOTE_TYPES.includes(task.release_note_type as typeof RELEASE_NOTE_TYPES[number])) {
    return task.release_note_type as typeof RELEASE_NOTE_TYPES[number];
  }
  const raw = `${task.task_type ?? ''} ${(task.tags ?? []).join(' ')}`.toLowerCase();
  if (raw.includes('fix') || raw.includes('bug') || raw.includes('corre')) return 'fix';
  if (raw.includes('melhoria') || raw.includes('improvement') || raw.includes('enhancement')) return 'improvement';
  if (raw.includes('internal') || raw.includes('interno')) return 'internal';
  return 'feature';
}

export async function generateProjectVersionReleaseNotes(projectId: string, versionId: string): Promise<string> {
  const versionResult = await pool.query<{ name: string }>(
    `SELECT name FROM project_versions WHERE id = $1 AND project_id = $2`,
    [versionId, projectId],
  );
  const versionName = versionResult.rows[0]?.name ?? 'Release';
  const tasksResult = await pool.query<{
    title: string;
    task_type: string | null;
    tags: string[] | null;
    release_note_type: string | null;
  }>(
    `SELECT title, task_type, tags, release_note_type
     FROM project_tasks
     WHERE project_id = $1
       AND (version_id = $2 OR (version_id IS NULL AND $2 = (
         SELECT id FROM project_versions WHERE project_id = $1 AND is_default = true LIMIT 1
       )))
       AND include_in_release_notes = true
       AND COALESCE(status, '') IN ('done', 'completed', 'closed')
     ORDER BY created_at ASC`,
    [projectId, versionId],
  );

  const groups: Record<typeof RELEASE_NOTE_TYPES[number], string[]> = {
    feature: [],
    fix: [],
    improvement: [],
    internal: [],
  };

  for (const task of tasksResult.rows) {
    groups[normalizeReleaseNoteType(task)].push(task.title);
  }

  const sections: Array<[string, string[]]> = [
    ['Novidades', groups.feature],
    ['Correções', groups.fix],
    ['Melhorias', groups.improvement],
    ['Interno', groups.internal],
  ];

  const lines = [versionName, ''];
  for (const [heading, items] of sections) {
    if (items.length === 0) continue;
    lines.push(heading);
    items.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  if (lines.length <= 2) {
    lines.push('Sem itens concluídos para o changelog.');
  }

  return lines.join('\n').trim();
}

export async function publishProjectVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { projectId, versionId } = req.params;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!tenantId) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    const project = await loadProjectInTenant(projectId, tenantId);
    if (!project) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }
    await assertModulePermission(userId, MODULE_PROJECTS, 'edit', { ownerId: project.user_id }, req as AuthRequest);
    if (!projectAllowsVersions(project.project_type)) {
      res.status(400).json({ error: 'Este tipo de projeto não possui versões' });
      return;
    }

    const validated = publishVersionSchema.parse(req.body);
    const current = await pool.query(
      `SELECT id FROM project_versions WHERE id = $1 AND project_id = $2`,
      [versionId, projectId],
    );
    if (current.rows.length === 0) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    if (validated.move_incomplete_to_version_id) {
      if (validated.move_incomplete_to_version_id === versionId) {
        res.status(400).json({ error: 'A versão destino deve ser diferente da origem' });
        return;
      }
      const target = await pool.query(
        `SELECT id, frozen FROM project_versions WHERE id = $1 AND project_id = $2 AND archived_at IS NULL`,
        [validated.move_incomplete_to_version_id, projectId],
      );
      if (target.rows.length === 0) {
        res.status(400).json({ error: 'Versão destino inválida' });
        return;
      }
      if (target.rows[0].frozen) {
        res.status(400).json({ error: 'Não é possível mover pendências para uma versão congelada' });
        return;
      }
    }

    const releaseNotes = validated.generate_release_notes
      ? await generateProjectVersionReleaseNotes(projectId, versionId)
      : null;

    if (validated.move_incomplete_to_version_id) {
      const moved = await pool.query(
        `UPDATE project_tasks
         SET version_id = $3, updated_at = now()
         WHERE project_id = $1
           AND (version_id = $2 OR (version_id IS NULL AND $2 = (
             SELECT id FROM project_versions WHERE project_id = $1 AND is_default = true LIMIT 1
           )))
           AND COALESCE(status, '') NOT IN ('done', 'completed', 'closed')
         RETURNING id`,
        [projectId, versionId, validated.move_incomplete_to_version_id],
      );
      if (moved.rowCount) {
        console.info('[project-task-moved-between-versions]', {
          projectId,
          fromVersionId: versionId,
          toVersionId: validated.move_incomplete_to_version_id,
          count: moved.rowCount,
        });
      }
    }

    const nextStatus = validated.archive_after_publish ? 'archived' : 'published';
    const updates = [
      `status = $3`,
      `published_at = now()`,
      `published_by = $4`,
      `frozen = $5`,
      `updated_at = now()`,
    ];
    const values: unknown[] = [versionId, projectId, nextStatus, userId, validated.freeze_version];
    if (releaseNotes !== null) {
      updates.push(`release_notes = $${values.length + 1}`);
      values.push(releaseNotes);
    }
    if (validated.archive_after_publish) {
      updates.push(`archived_at = now()`, `archived_by = $${values.length + 1}`);
      values.push(userId);
    }

    await pool.query(
      `UPDATE project_versions
       SET ${updates.join(', ')}
       WHERE id = $1 AND project_id = $2`,
      values,
    );

    console.info('[project-version-published]', { projectId, versionId });
    if (validated.freeze_version) {
      console.info('[project-version-frozen]', { projectId, versionId });
    }
    const version = await loadVersionById(projectId, versionId);
    res.json(version);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error publishing project version:', error);
    res.status(500).json({ error: 'Erro ao publicar versão' });
  }
}

export async function duplicateProjectVersion(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthRequest).userId;
    const tenantId = (req as AuthRequest).tenantId ?? null;
    const { projectId, versionId } = req.params;
    if (!userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    if (!tenantId) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }

    const project = await loadProjectInTenant(projectId, tenantId);
    if (!project) {
      res.status(404).json({ error: 'Projeto não encontrado' });
      return;
    }
    await assertModulePermission(userId, MODULE_PROJECTS, 'edit', { ownerId: project.user_id }, req as AuthRequest);
    if (!projectAllowsVersions(project.project_type)) {
      res.status(400).json({ error: 'Este tipo de projeto não possui versões' });
      return;
    }

    const validated = duplicateVersionSchema.parse(req.body);
    const source = await pool.query(
      `SELECT * FROM project_versions WHERE id = $1 AND project_id = $2`,
      [versionId, projectId],
    );
    if (source.rows.length === 0) {
      res.status(404).json({ error: 'Versão não encontrada' });
      return;
    }

    const orderResult = await pool.query<{ next_order: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_versions WHERE project_id = $1`,
      [projectId],
    );
    const created = await pool.query<{ id: string }>(
      `INSERT INTO project_versions (
         project_id, name, description, status, start_date, due_date, sort_order, is_default, created_by
       ) VALUES ($1, $2, $3, 'planning', $4, $5, $6, false, $7)
       RETURNING id`,
      [
        projectId,
        validated.name.trim(),
        source.rows[0].description ?? null,
        source.rows[0].start_date ?? null,
        source.rows[0].due_date ?? null,
        orderResult.rows[0]?.next_order ?? 0,
        userId,
      ],
    );
    const newVersionId = created.rows[0].id;

    if (validated.copy_open_tasks || validated.copy_completed_tasks) {
      await pool.query(
        `INSERT INTO project_tasks (
          list_id, project_id, user_id, area_id, version_id, title, description, status, priority, due_date, assignee_id,
          tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
          checklist, attachments, dependencies, watchers, reminders, recurrence_rule,
          milestone_id, parent_task_id, sprint_id, visibility, billable, hourly_rate,
          budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
          include_in_release_notes, release_note_type
        )
        SELECT
          list_id, project_id, $3, area_id, $4, title, description, status, priority, due_date, assignee_id,
          tags, start_date, start_time, end_time, estimated_effort_hours, estimated_story_points,
          CASE WHEN $5 THEN checklist ELSE '[]'::jsonb END,
          attachments, dependencies, watchers, reminders, recurrence_rule,
          milestone_id, NULL, sprint_id, visibility, billable, hourly_rate,
          budget_cap, custom_fields, severity, task_type, meeting_location, meeting_link,
          include_in_release_notes, release_note_type
        FROM project_tasks
        WHERE project_id = $1
          AND (version_id = $2 OR (version_id IS NULL AND $2 = (
            SELECT id FROM project_versions WHERE project_id = $1 AND is_default = true LIMIT 1
          )))
          AND (
            ($6 = true AND COALESCE(status, '') NOT IN ('done', 'completed', 'closed'))
            OR ($7 = true AND COALESCE(status, '') IN ('done', 'completed', 'closed'))
          )`,
        [
          projectId,
          versionId,
          userId,
          newVersionId,
          validated.copy_checklists,
          validated.copy_open_tasks,
          validated.copy_completed_tasks,
        ],
      );
    }

    console.info('[project-version-duplicated]', { projectId, versionId, newVersionId });
    const version = await loadVersionById(projectId, newVersionId);
    res.status(201).json(version);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error duplicating project version:', error);
    res.status(500).json({ error: 'Erro ao duplicar versão' });
  }
}

export async function listProjectVersionsForProjectDetail(projectId: string): Promise<ReturnType<typeof mapVersionRow>[]> {
  return loadVersionsForProject(projectId, false);
}
