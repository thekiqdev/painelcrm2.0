import { apiClient } from '@/integrations/api/client';

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string | null;
  time?: string | null;
  status: 'pending' | 'completed';
  priority: 'low' | 'medium' | 'high';
  client?: string | null;
  deal?: string | null;
  assignee?: string | null;
  assigneeAvatar?: string | null;
  checklist?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export const tasksService = {
  async getTasks(filters?: { status?: string; date?: string }): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.date) params.append('date', filters.date);
    
    const query = params.toString();
    const response = await apiClient.get<Task[]>(`/api/tasks${query ? `?${query}` : ''}`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getTaskById(id: string): Promise<Task> {
    const response = await apiClient.get<Task>(`/api/tasks/${id}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Tarefa não encontrada');
    return response.data;
  },

  async createTask(task: Omit<Task, 'id' | 'assigneeAvatar'>): Promise<Task> {
    const response = await apiClient.post<Task>('/api/tasks', {
      title: task.title,
      description: task.description || null,
      due_date: task.date || null,
      due_time: task.time || null,
      status: task.status || 'pending',
      priority: task.priority || 'medium',
      client_name: task.client || null,
      deal: task.deal || null,
      assignee_name: task.assignee || null,
      checklist: task.checklist || [],
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao criar tarefa');
    return response.data;
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
      assignee_name: task.assignee,
      checklist: task.checklist,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao atualizar tarefa');
    return response.data;
  },

  async deleteTask(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/tasks/${id}`);
    if (response.error) throw new Error(response.error);
  },
};

