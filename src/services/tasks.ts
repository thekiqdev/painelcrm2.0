import { apiClient } from '@/integrations/api/client';

export type TaskOriginApi = 'standalone' | 'project' | 'client' | 'lead';

export type NormalizedTaskStatusApi = 'todo' | 'in_progress' | 'waiting' | 'done';

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string | null;
  time?: string | null;
  /** Status na origem (pending/completed, todo/done, Pendente, etc.) */
  status: string;
  priority: 'low' | 'medium' | 'high';
  /** Criador da tarefa (API: user_id). */
  user_id?: string;
  /** UUID do responsável (API: assignee_id). */
  assignee_id?: string | null;
  clientId?: string | null;
  client?: string | null;
  deal?: string | null;
  assignee?: string | null;
  assigneeAvatar?: string | null;
  checklist?: ChecklistItem[];
  origin?: TaskOriginApi;
  normalized_status?: NormalizedTaskStatusApi;
  project_id?: string | null;
  project_name?: string | null;
  client_name?: string | null;
  lead_id?: string | null;
  lead_name?: string | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

function coercePriority(p: unknown): 'low' | 'medium' | 'high' {
  const v = String(p ?? 'medium').toLowerCase();
  if (v === 'high' || v === 'alta') return 'high';
  if (v === 'low' || v === 'baixa') return 'low';
  return 'medium';
}

const normalizeTask = (task: Record<string, unknown>): Task => ({
  ...task,
  title: String(task.title ?? ''),
  status: String(task.status ?? ''),
  clientId: (task.clientId ?? task.client_id) as string | null | undefined,
  user_id: task.user_id as string | undefined,
  assignee_id: (task.assignee_id ?? null) as string | null,
  origin: task.origin as TaskOriginApi | undefined,
  normalized_status: task.normalized_status as NormalizedTaskStatusApi | undefined,
  project_id: (task.project_id ?? null) as string | null | undefined,
  project_name: (task.project_name ?? null) as string | null | undefined,
  client_name: (task.client_name ?? null) as string | null | undefined,
  lead_id: (task.lead_id ?? null) as string | null | undefined,
  lead_name: (task.lead_name ?? null) as string | null | undefined,
  priority: coercePriority(task.priority),
});

/** Indica conclusão para qualquer origem (usa normalized_status quando existir). */
export function taskLooksCompleted(task: Pick<Task, 'status' | 'normalized_status'>): boolean {
  if (task.normalized_status) return task.normalized_status === 'done';
  return task.status === 'completed';
}

export interface TaskListQuery {
  status?: string;
  date?: string;
  clientId?: string;
  scope?: string;
  origin?: string;
  project_id?: string;
  client_id?: string;
  lead_id?: string;
  normalized_status?: string;
  due?: string;
  q?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface TasksSummaryResponse {
  mine_total: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
  by_status: Record<NormalizedTaskStatusApi, number>;
}

export const tasksService = {
  async getTasks(filters?: TaskListQuery): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.date) params.append('date', filters.date);
    if (filters?.clientId) params.append('clientId', filters.clientId);
    if (filters?.scope) params.append('scope', filters.scope);
    if (filters?.origin) params.append('origin', filters.origin);
    if (filters?.project_id) params.append('project_id', filters.project_id);
    if (filters?.client_id) params.append('client_id', filters.client_id);
    if (filters?.lead_id) params.append('lead_id', filters.lead_id);
    if (filters?.normalized_status) params.append('normalized_status', filters.normalized_status);
    if (filters?.due) params.append('due', filters.due);
    if (filters?.q) params.append('q', filters.q);
    if (filters?.sort) params.append('sort', filters.sort);
    if (filters?.limit != null) params.append('limit', String(filters.limit));
    if (filters?.offset != null) params.append('offset', String(filters.offset));

    const query = params.toString();
    const response = await apiClient.get<Task[]>(`/api/tasks${query ? `?${query}` : ''}`);
    if (response.error) throw new Error(response.error);
    return (response.data || []).map((t) => normalizeTask(t as Record<string, unknown>));
  },

  async getTasksSummary(): Promise<TasksSummaryResponse> {
    const response = await apiClient.get<TasksSummaryResponse>('/api/tasks/summary');
    if (response.error) throw new Error(response.error);
    if (!response.data) {
      return {
        mine_total: 0,
        overdue: 0,
        due_today: 0,
        due_this_week: 0,
        by_status: { todo: 0, in_progress: 0, waiting: 0, done: 0 },
      };
    }
    return response.data;
  },

  async getTaskById(id: string): Promise<Task> {
    const response = await apiClient.get<Task>(`/api/tasks/${id}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Tarefa não encontrada');
    return normalizeTask(response.data);
  },

  async createTask(task: Omit<Task, 'id' | 'assigneeAvatar'>): Promise<Task> {
    const response = await apiClient.post<Task>('/api/tasks', {
      title: task.title,
      description: task.description || null,
      due_date: task.date || null,
      due_time: task.time || null,
      status: (task.status === 'completed' ? 'completed' : 'pending') as 'pending' | 'completed',
      priority: task.priority || 'medium',
      client_id: task.clientId || null,
      client_name: task.client || null,
      deal: task.deal || null,
      assignee_id: task.assignee_id ?? null,
      assignee_name: task.assignee ?? null,
      checklist: task.checklist || [],
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao criar tarefa');
    return normalizeTask(response.data);
  },

  async updateTask(id: string, task: Partial<Task>): Promise<Task> {
    const response = await apiClient.patch<Task>(`/api/tasks/${id}`, {
      title: task.title,
      description: task.description,
      due_date: task.date,
      due_time: task.time,
      status: task.status,
      priority: task.priority,
      client_name: task.client,
      deal: task.deal,
      assignee_id: task.assignee_id,
      assignee_name: task.assignee,
      checklist: task.checklist,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao atualizar tarefa');
    return normalizeTask(response.data);
  },

  async deleteTask(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/tasks/${id}`);
    if (response.error) throw new Error(response.error);
  },

  /** PATCH /api/lead-tasks/:id — status livre (texto). */
  async updateLeadTask(taskId: string, body: { status?: string }): Promise<void> {
    const response = await apiClient.patch(`/api/lead-tasks/${taskId}`, body);
    if (response.error) throw new Error(response.error);
  },
};

