/** Status de tarefa de projeto considerados concluídos (métricas de versão, relatórios). */
export const COMPLETED_PROJECT_TASK_STATUSES = ['done', 'completed', 'closed'] as const;

export const COMPLETED_PROJECT_TASK_STATUS_SQL = `COALESCE(t.status, '') IN ('done', 'completed', 'closed')`;

export const OPEN_PROJECT_TASK_STATUS_SQL = `COALESCE(t.status, '') NOT IN ('done', 'completed', 'closed')`;
