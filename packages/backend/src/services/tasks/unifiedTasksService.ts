import type { PoolClient } from 'pg';

import { pool } from '../../utils/db.js';
import type {
  NormalizedTaskStatus,
  TaskOrigin,
  UnifiedTaskDto,
  UnifiedTaskListFilters,
  UnifiedTasksSummaryDto,
} from './unifiedTaskTypes.js';

export type TasksGranularPermissions = {
  viewAll: boolean;
};

export function normalizeTaskStatus(raw: string | null | undefined, origin: TaskOrigin): NormalizedTaskStatus {
  const s = String(raw ?? '').trim().toLowerCase();

  if (origin === 'standalone') {
    if (s === 'pending') return 'todo';
    if (s === 'in_progress') return 'in_progress';
    if (s === 'waiting') return 'waiting';
    if (s === 'completed') return 'done';
    if (s === 'cancelled') return 'done';
    return 'todo';
  }

  if (origin === 'project') {
    if (s === 'todo') return 'todo';
    if (s === 'in_progress') return 'in_progress';
    if (s === 'review' || s === 'waiting' || s === 'blocked') return 'waiting';
    if (s === 'done' || s === 'completed') return 'done';
    return 'todo';
  }

  if (s === 'pending' || s === 'pendente') return 'todo';
  if (s === 'completed' || s === 'concluída' || s === 'concluida' || s === 'concluído' || s === 'concluido')
    return 'done';
  if (s === 'in_progress' || s === 'em progresso' || s === 'em andamento') return 'in_progress';
  if (s === 'waiting' || s === 'aguardando' || s === 'revisão' || s === 'revisao') return 'waiting';
  return 'todo';
}

function priorityRank(p?: string | null): number {
  const v = String(p ?? 'medium').toLowerCase();
  if (v === 'high' || v === 'alta') return 0;
  if (v === 'medium' || v === 'média' || v === 'media') return 1;
  return 2;
}

function mapRowToDto(row: Record<string, unknown>): UnifiedTaskDto {
  const origin = String(row.origin) as TaskOrigin;
  const id = String(row.id);
  const dueDate = row.due_date != null ? String(row.due_date).slice(0, 10) : null;
  const dueTime = row.due_time != null && String(row.due_time).trim() ? String(row.due_time) : null;
  let dueAt: string | null = null;
  if (row.due_at != null) {
    const t = new Date(String(row.due_at));
    if (!Number.isNaN(t.getTime())) dueAt = t.toISOString();
  }
  if (!dueAt && origin === 'standalone' && dueDate) {
    const iso = `${dueDate}T${dueTime && dueTime.length >= 4 ? (dueTime.length === 5 ? `${dueTime}:00` : dueTime) : '00:00:00'}`;
    const t = new Date(iso);
    if (!Number.isNaN(t.getTime())) dueAt = t.toISOString();
  }
  const status = String(row.status ?? '');
  const normalized_status = normalizeTaskStatus(status, origin);

  return {
    id,
    origin,
    origin_id: id,
    title: String(row.title ?? ''),
    description: row.description != null ? String(row.description) : null,
    status,
    normalized_status,
    priority: row.priority != null ? String(row.priority) : null,
    due_at: dueAt,
    due_date: dueDate,
    due_time: dueTime,
    user_id: String(row.user_id),
    assignee_id: row.assignee_id != null ? String(row.assignee_id) : null,
    assignee_name: row.assignee_name != null ? String(row.assignee_name) : null,
    project_id: row.project_id != null ? String(row.project_id) : null,
    project_name: row.project_name != null ? String(row.project_name) : null,
    client_id: row.client_id != null ? String(row.client_id) : null,
    client_name: row.client_name != null ? String(row.client_name) : null,
    lead_id: row.lead_id != null ? String(row.lead_id) : null,
    lead_name: row.lead_name != null ? String(row.lead_name) : null,
    deal: row.deal != null ? String(row.deal) : null,
    checklist: row.checklist ?? [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function isDoneNormalized(ns: NormalizedTaskStatus): boolean {
  return ns === 'done';
}

function isOverdue(dto: UnifiedTaskDto): boolean {
  if (!dto.due_at) return false;
  if (isDoneNormalized(dto.normalized_status)) return false;
  return new Date(dto.due_at).getTime() < Date.now();
}

function compareUnified(a: UnifiedTaskDto, b: UnifiedTaskDto, sort: string): number {
  const ao = isOverdue(a) ? 0 : 1;
  const bo = isOverdue(b) ? 0 : 1;
  if (ao !== bo) return ao - bo;

  if (sort === 'updated') {
    const au = new Date(a.updated_at).getTime();
    const bu = new Date(b.updated_at).getTime();
    if (au !== bu) return bu - au;
  } else if (sort === 'priority') {
    const ap = priorityRank(a.priority);
    const bp = priorityRank(b.priority);
    if (ap !== bp) return ap - bp;
  } else {
    const ad = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    const ap = priorityRank(a.priority);
    const bp = priorityRank(b.priority);
    if (ap !== bp) return ap - bp;
    const au = new Date(a.updated_at).getTime();
    const bu = new Date(b.updated_at).getTime();
    if (au !== bu) return bu - au;
  }
  return String(a.id).localeCompare(String(b.id));
}

function applyDueFilter(dto: UnifiedTaskDto, due?: string): boolean {
  const d = String(due ?? '').toLowerCase();
  if (!d) return true;
  if (d === 'none') return !dto.due_at;
  const now = new Date();
  const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!dto.due_at) return d === 'none';
  const dt = new Date(dto.due_at);
  if (d === 'overdue') {
    return (
      !isDoneNormalized(dto.normalized_status) &&
      dt.getTime() < Date.now()
    );
  }
  if (d === 'today') {
    return (
      dt.getUTCFullYear() === now.getUTCFullYear() &&
      dt.getUTCMonth() === now.getUTCMonth() &&
      dt.getUTCDate() === now.getUTCDate()
    );
  }
  if (d === 'week') {
    const end = new Date(startOfUtcDay);
    end.setUTCDate(end.getUTCDate() + 7);
    return dt >= startOfUtcDay && dt < end;
  }
  return true;
}

/** Escopo da lista (filtro adicional sobre linhas já visíveis por permissão). */
function buildScopeSql(scopeRaw: string, viewAll: boolean): string {
  let scope = String(scopeRaw || 'minhas').toLowerCase();
  if (scope === 'todas' && !viewAll) scope = 'minhas';

  const mine =
    '(x.user_id = $2::uuid OR (x.assignee_id IS NOT NULL AND x.assignee_id = $2::uuid))';

  if (!viewAll) {
    if (scope === 'criadas') return 'x.user_id = $2::uuid';
    if (scope === 'atribuidas') return '(x.assignee_id IS NOT NULL AND x.assignee_id = $2::uuid)';
    if (scope === 'sem_responsavel') return 'x.assignee_id IS NULL';
    return mine;
  }

  if (scope === 'todas') return 'TRUE';
  if (scope === 'criadas') return 'x.user_id = $2::uuid';
  if (scope === 'atribuidas') return '(x.assignee_id IS NOT NULL AND x.assignee_id = $2::uuid)';
  if (scope === 'sem_responsavel') return 'x.assignee_id IS NULL';
  return mine;
}

export async function listUnifiedTasks(params: {
  tenantId: string;
  userId: string;
  filters?: UnifiedTaskListFilters;
  permissions: TasksGranularPermissions;
  db?: PoolClient;
}): Promise<UnifiedTaskDto[]> {
  const { tenantId, userId, permissions } = params;
  const f = params.filters ?? {};
  const db = params.db ?? pool;

  const viewAll = permissions.viewAll === true;

  const defaultScope = viewAll ? 'todas' : 'minhas';
  let scope = String(f.scope ?? defaultScope).toLowerCase();
  if (scope === 'todas' && !viewAll) scope = 'minhas';

  const sortMode = String(f.sort ?? 'due').toLowerCase();
  const sort = sortMode === 'updated' || sortMode === 'priority' ? sortMode : 'due';

  const innerStandalone = viewAll
    ? 'TRUE'
    : '(t.user_id = $2::uuid OR (t.assignee_id IS NOT NULL AND t.assignee_id = $2::uuid))';
  const innerProject = viewAll
    ? 'TRUE'
    : '(pt.user_id = $2::uuid OR (pt.assignee_id IS NOT NULL AND pt.assignee_id = $2::uuid))';
  const innerClient = viewAll ? 'TRUE' : 'ct.user_id = $2::uuid';
  const innerLead = viewAll ? 'TRUE' : 'lt.user_id = $2::uuid';

  const unionSql = `
    SELECT
      t.id,
      'standalone'::text AS origin,
      t.title,
      t.description,
      t.status,
      t.priority,
      CASE
        WHEN t.due_date IS NULL THEN NULL
        WHEN NULLIF(trim(COALESCE(t.due_time, '')), '') IS NULL THEN (t.due_date::timestamp AT TIME ZONE 'UTC')
        ELSE (
          (t.due_date::text || ' ' ||
            CASE
              WHEN trim(t.due_time) LIKE '__:__' AND trim(t.due_time) NOT LIKE '%:%:%' THEN trim(t.due_time) || ':00'
              ELSE trim(t.due_time)
            END
          )::timestamp AT TIME ZONE 'UTC'
        )
      END AS due_at,
      CASE WHEN t.due_date IS NULL THEN NULL ELSE to_char(t.due_date::date, 'YYYY-MM-DD') END AS due_date,
      t.due_time,
      t.user_id,
      t.assignee_id,
      COALESCE(
        NULLIF(trim(concat_ws(' ', ap.first_name, ap.last_name)), ''),
        t.assignee_name
      ) AS assignee_name,
      NULL::uuid AS project_id,
      NULL::text AS project_name,
      NULL::uuid AS client_id,
      NULL::text AS client_name,
      NULL::uuid AS lead_id,
      NULL::text AS lead_name,
      t.deal,
      COALESCE(t.checklist, '[]'::jsonb) AS checklist,
      t.created_at,
      t.updated_at
    FROM tasks t
    INNER JOIN users u ON u.id = t.user_id AND u.tenant_id = $1::uuid
    LEFT JOIN profiles ap ON ap.id = t.assignee_id
    WHERE ${innerStandalone}

    UNION ALL

    SELECT
      pt.id,
      'project'::text AS origin,
      pt.title,
      pt.description,
      pt.status,
      pt.priority,
      pt.due_date AS due_at,
      CASE WHEN pt.due_date IS NULL THEN NULL ELSE to_char(pt.due_date::date, 'YYYY-MM-DD') END AS due_date,
      NULL::text AS due_time,
      pt.user_id,
      pt.assignee_id,
      NULLIF(trim(concat_ws(' ', pap.first_name, pap.last_name)), '') AS assignee_name,
      p.id AS project_id,
      p.name AS project_name,
      NULL::uuid AS client_id,
      NULL::text AS client_name,
      NULL::uuid AS lead_id,
      NULL::text AS lead_name,
      NULL::text AS deal,
      COALESCE(pt.checklist, '[]'::jsonb) AS checklist,
      pt.created_at,
      pt.updated_at
    FROM project_tasks pt
    INNER JOIN projects p ON p.id = pt.project_id
    INNER JOIN users owner ON owner.id = p.user_id AND owner.tenant_id = $1::uuid
    LEFT JOIN profiles pap ON pap.id = pt.assignee_id
    WHERE ${innerProject}

    UNION ALL

    SELECT
      ct.id,
      'client'::text AS origin,
      ct.title,
      ct.description,
      ct.status,
      'medium'::text AS priority,
      ct.due_date AS due_at,
      CASE WHEN ct.due_date IS NULL THEN NULL ELSE to_char(ct.due_date::date, 'YYYY-MM-DD') END AS due_date,
      NULL::text AS due_time,
      ct.user_id,
      NULL::uuid AS assignee_id,
      NULL::text AS assignee_name,
      NULL::uuid AS project_id,
      NULL::text AS project_name,
      c.id AS client_id,
      c.name AS client_name,
      NULL::uuid AS lead_id,
      NULL::text AS lead_name,
      NULL::text AS deal,
      '[]'::jsonb AS checklist,
      ct.created_at,
      ct.updated_at
    FROM client_tasks ct
    INNER JOIN clients c ON c.id = ct.client_id
    INNER JOIN users cu ON cu.id = c.user_id AND cu.tenant_id = $1::uuid
    WHERE ${innerClient}

    UNION ALL

    SELECT
      lt.id,
      'lead'::text AS origin,
      lt.title,
      lt.description,
      lt.status,
      'medium'::text AS priority,
      lt.due_date AS due_at,
      CASE WHEN lt.due_date IS NULL THEN NULL ELSE to_char(lt.due_date::date, 'YYYY-MM-DD') END AS due_date,
      NULL::text AS due_time,
      lt.user_id,
      NULL::uuid AS assignee_id,
      NULL::text AS assignee_name,
      NULL::uuid AS project_id,
      NULL::text AS project_name,
      NULL::uuid AS client_id,
      NULL::text AS client_name,
      l.id AS lead_id,
      l.name AS lead_name,
      NULL::text AS deal,
      '[]'::jsonb AS checklist,
      lt.created_at,
      lt.updated_at
    FROM lead_tasks lt
    INNER JOIN leads l ON l.id = lt.lead_id
    INNER JOIN users lu ON lu.id = l.user_id AND lu.tenant_id = $1::uuid
    WHERE ${innerLead}
  `;

  const values: unknown[] = [tenantId, userId];
  let i = 3;
  const push = (v: unknown) => {
    values.push(v);
    return `$${i++}`;
  };

  const scopeSql = buildScopeSql(scope, viewAll);

  const originFilter = f.origin ? push(String(f.origin)) : null;
  const projectFilter = f.project_id ? push(f.project_id) : null;
  const clientFilter = f.client_id ? push(f.client_id) : null;
  const leadFilter = f.lead_id ? push(f.lead_id) : null;
  const statusFilter = f.status ? push(String(f.status).toLowerCase()) : null;
  const dateLegacyFilter = f.date ? push(f.date) : null;
  const clientLegacyFilter = f.clientId ? push(f.clientId) : null;
  const qFilter = f.q && String(f.q).trim() ? `%${String(f.q).trim().toLowerCase()}%` : null;
  const qParam = qFilter ? push(qFilter) : null;

  const outerParts: string[] = [`(${scopeSql})`];

  if (originFilter) outerParts.push(`(x.origin = ${originFilter})`);
  if (projectFilter) outerParts.push(`(x.project_id = ${projectFilter}::uuid)`);
  if (clientFilter) outerParts.push(`(x.client_id = ${clientFilter}::uuid)`);
  if (leadFilter) outerParts.push(`(x.lead_id = ${leadFilter}::uuid)`);
  if (statusFilter) outerParts.push(`(lower(x.status) = ${statusFilter})`);
  if (dateLegacyFilter) outerParts.push(`(x.due_date = ${dateLegacyFilter})`);
  if (clientLegacyFilter) outerParts.push(`(x.client_id = ${clientLegacyFilter}::uuid)`);
  if (qParam) {
    outerParts.push(
      `(lower(x.title) LIKE ${qParam} OR lower(coalesce(x.description, '')) LIKE ${qParam})`,
    );
  }

  const sql = `
    SELECT x.* FROM (
      ${unionSql}
    ) x
    WHERE ${outerParts.join(' AND ')}
  `;

  const { rows } = await db.query<Record<string, unknown>>(sql, values);

  let mapped = rows.map(mapRowToDto);

  if (f.normalized_status) {
    const ns = String(f.normalized_status).toLowerCase() as NormalizedTaskStatus;
    mapped = mapped.filter((t) => t.normalized_status === ns);
  }

  if (f.due) {
    mapped = mapped.filter((t) => applyDueFilter(t, String(f.due)));
  }

  mapped.sort((a, b) => compareUnified(a, b, sort));

  const lim = f.limit;
  const off = typeof f.offset === 'number' && f.offset > 0 ? f.offset : 0;
  if (typeof lim === 'number' && lim > 0) {
    mapped = mapped.slice(off, off + lim);
  }

  return mapped;
}

export async function summarizeUnifiedTasks(params: {
  tenantId: string;
  userId: string;
  permissions: TasksGranularPermissions;
  db?: PoolClient;
}): Promise<UnifiedTasksSummaryDto> {
  const rows = await listUnifiedTasks({
    ...params,
    filters: { scope: 'minhas', sort: 'due' },
  });

  const by_status: Record<NormalizedTaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    waiting: 0,
    done: 0,
  };

  let overdue = 0;
  let due_today = 0;
  let due_this_week = 0;

  for (const t of rows) {
    const ns = t.normalized_status;
    by_status[ns] = (by_status[ns] ?? 0) + 1;
    if (ns === 'done') continue;
    if (isOverdue(t)) overdue += 1;
    if (applyDueFilter(t, 'today')) due_today += 1;
    if (applyDueFilter(t, 'week')) due_this_week += 1;
  }

  return {
    mine_total: rows.length,
    overdue,
    due_today,
    due_this_week,
    by_status,
  };
}
