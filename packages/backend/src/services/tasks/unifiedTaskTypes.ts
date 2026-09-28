/**
 * Contrato de listagem unificada (GET /api/tasks) — várias origens no UNION.
 */
export type TaskOrigin = 'standalone' | 'project' | 'client' | 'lead';

export type NormalizedTaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done';

export interface UnifiedTaskDto {
  id: string;
  origin: TaskOrigin;
  origin_id: string;
  title: string;
  description?: string | null;
  /** Status bruto na tabela de origem. */
  status: string;
  normalized_status: NormalizedTaskStatus;
  priority?: string | null;
  /** ISO 8601 quando disponível (melhor esforço por origem). */
  due_at?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  user_id: string;
  assignee_id?: string | null;
  assignee_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  lead_id?: string | null;
  lead_name?: string | null;
  deal?: string | null;
  checklist?: unknown;
  created_at: string;
  updated_at: string;
}

export type TaskListScope = 'minhas' | 'criadas' | 'atribuidas' | 'sem_responsavel' | 'todas';

export interface UnifiedTaskListFilters {
  scope?: TaskListScope | string;
  origin?: TaskOrigin | string;
  project_id?: string;
  client_id?: string;
  lead_id?: string;
  status?: string;
  normalized_status?: NormalizedTaskStatus | string;
  due?: 'today' | 'week' | 'overdue' | 'none' | string;
  q?: string;
  /** Legado: filtro por data exata (YYYY-MM-DD) — mantido para compat. */
  date?: string;
  /** Legado */
  clientId?: string;
  sort?: 'due' | 'updated' | 'priority' | string;
  /** Paginação aplicada após ordenação e filtros em memória (incl. due). */
  limit?: number;
  offset?: number;
}

/** GET /api/tasks/summary — agregados para escopo “minhas”. */
export interface UnifiedTasksSummaryDto {
  mine_total: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
  by_status: Record<NormalizedTaskStatus, number>;
}
