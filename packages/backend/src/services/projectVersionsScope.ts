import { pool } from '../utils/db.js';

export const PROJECT_TYPES_WITH_AREAS = ['areas', 'advanced'] as const;

export function projectAllowsAreas(projectType: string | null | undefined): boolean {
  return PROJECT_TYPES_WITH_AREAS.includes(projectType as (typeof PROJECT_TYPES_WITH_AREAS)[number]);
}

export function projectAllowsVersions(projectType: string | null | undefined): boolean {
  return projectType === 'advanced';
}

export type ProjectScopeRow = {
  id: string;
  user_id: string;
  project_type: string;
};

export async function loadProjectInTenant(
  projectId: string,
  tenantId: string,
): Promise<ProjectScopeRow | null> {
  const result = await pool.query<ProjectScopeRow>(
    `SELECT p.id, p.user_id, p.project_type
     FROM projects p
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
     WHERE p.id = $2`,
    [tenantId, projectId],
  );
  return result.rows[0] ?? null;
}

export async function assertVersionInProject(versionId: string, projectId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM project_versions WHERE id = $1 AND project_id = $2`,
    [versionId, projectId],
  );
  return result.rows.length > 0;
}

export async function assertAreaInProject(areaId: string, projectId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM project_areas WHERE id = $1 AND project_id = $2`,
    [areaId, projectId],
  );
  return result.rows.length > 0;
}

export async function assertListInProject(listId: string, projectId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM project_lists WHERE id = $1 AND project_id = $2`,
    [listId, projectId],
  );
  return result.rows.length > 0;
}

export async function getDefaultProjectVersionId(projectId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM project_versions
     WHERE project_id = $1 AND archived_at IS NULL
     ORDER BY is_default DESC, sort_order ASC, created_at ASC
     LIMIT 1`,
    [projectId],
  );
  return result.rows[0]?.id ?? null;
}

export async function appendProjectTaskVersionFilter(
  sql: string,
  params: unknown[],
  versionIdRaw: string | null,
  projectId: string,
): Promise<string> {
  if (!versionIdRaw) {
    return sql;
  }

  let versionId = versionIdRaw;
  if (versionIdRaw === 'none') {
    const defaultVersionId = await getDefaultProjectVersionId(projectId);
    if (!defaultVersionId) {
      return `${sql} AND version_id IS NULL`;
    }
    versionId = defaultVersionId;
  }

  const defaultVersionId = await getDefaultProjectVersionId(projectId);
  params.push(versionId);
  if (defaultVersionId && versionId === defaultVersionId) {
    return `${sql} AND (version_id = $${params.length} OR version_id IS NULL)`;
  }
  return `${sql} AND version_id = $${params.length}`;
}
