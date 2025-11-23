import { apiClient } from '@/integrations/api/client';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  due_date: string | null;
  tags: string[];
  kanban_stage: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectList {
  id: string;
  project_id: string;
  name: string;
  order_position: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectTask {
  id: string;
  list_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
  tags: string[];
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  estimated_effort_hours: number | null;
  estimated_story_points: number | null;
  checklist: any[];
  attachments: any[];
  dependencies: any[];
  watchers: string[];
  reminders: any[];
  recurrence_rule: any | null;
  milestone_id: string | null;
  parent_task_id: string | null;
  sprint_id: string | null;
  visibility: string;
  billable: boolean;
  hourly_rate: number | null;
  budget_cap: number | null;
  custom_fields: Record<string, any>;
  severity: string | null;
  task_type: string;
  meeting_location: string | null;
  meeting_link: string | null;
  created_at: string;
  updated_at: string;
}

export class ProjectsService {
  // Projetos
  async getProjects(): Promise<Project[]> {
    const response = await apiClient.get<Project[]>('/api/projects');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async getProjectById(id: string): Promise<Project> {
    const response = await apiClient.get<Project>(`/api/projects/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async createProject(data: {
    name: string;
    description?: string | null;
    status?: string;
    due_date?: string | null;
    tags?: string[];
    kanban_stage?: string | null;
  }): Promise<Project> {
    const response = await apiClient.post<Project>('/api/projects', data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async updateProject(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      status?: string;
      due_date?: string | null;
      tags?: string[];
      kanban_stage?: string | null;
    }
  ): Promise<Project> {
    const response = await apiClient.patch<Project>(`/api/projects/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteProject(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/projects/${id}`);
    if (response.error) throw new Error(response.error);
  }

  // Listas de Projetos
  async getProjectLists(projectId: string): Promise<ProjectList[]> {
    const response = await apiClient.get<ProjectList[]>(`/api/projects/${projectId}/lists`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createProjectList(
    projectId: string,
    data: {
      name: string;
      order_position?: number;
    }
  ): Promise<ProjectList> {
    const response = await apiClient.post<ProjectList>(`/api/projects/${projectId}/lists`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async updateProjectList(
    listId: string,
    data: {
      name?: string;
      order_position?: number;
    }
  ): Promise<ProjectList> {
    const response = await apiClient.patch<ProjectList>(`/api/projects/lists/${listId}`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteProjectList(listId: string): Promise<void> {
    const response = await apiClient.delete(`/api/projects/lists/${listId}`);
    if (response.error) throw new Error(response.error);
  }

  // Tarefas de Projetos
  async getProjectTasks(listId: string): Promise<ProjectTask[]> {
    const response = await apiClient.get<ProjectTask[]>(`/api/projects/lists/${listId}/tasks`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async getProjectTaskById(taskId: string): Promise<ProjectTask> {
    const response = await apiClient.get<ProjectTask>(`/api/projects/tasks/${taskId}`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async createProjectTask(
    listId: string,
    data: {
      title: string;
      description?: string | null;
      status?: string;
      priority?: string;
      due_date?: string | null;
      assignee_id?: string | null;
      tags?: string[];
      start_date?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      estimated_effort_hours?: number | null;
      estimated_story_points?: number | null;
      checklist?: any[];
      attachments?: any[];
      dependencies?: any[];
      watchers?: string[];
      reminders?: any[];
      recurrence_rule?: any | null;
      milestone_id?: string | null;
      parent_task_id?: string | null;
      sprint_id?: string | null;
      visibility?: string;
      billable?: boolean;
      hourly_rate?: number | null;
      budget_cap?: number | null;
      custom_fields?: Record<string, any>;
      severity?: string | null;
      task_type?: string;
      meeting_location?: string | null;
      meeting_link?: string | null;
    }
  ): Promise<ProjectTask> {
    const response = await apiClient.post<ProjectTask>(`/api/projects/lists/${listId}/tasks`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async updateProjectTask(
    taskId: string,
    data: {
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string;
      due_date?: string | null;
      assignee_id?: string | null;
      tags?: string[];
      start_date?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      estimated_effort_hours?: number | null;
      estimated_story_points?: number | null;
      checklist?: any[];
      attachments?: any[];
      dependencies?: any[];
      watchers?: string[];
      reminders?: any[];
      recurrence_rule?: any | null;
      milestone_id?: string | null;
      parent_task_id?: string | null;
      sprint_id?: string | null;
      visibility?: string;
      billable?: boolean;
      hourly_rate?: number | null;
      budget_cap?: number | null;
      custom_fields?: Record<string, any>;
      severity?: string | null;
      task_type?: string;
      meeting_location?: string | null;
      meeting_link?: string | null;
    }
  ): Promise<ProjectTask> {
    const response = await apiClient.patch<ProjectTask>(`/api/projects/tasks/${taskId}`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteProjectTask(taskId: string): Promise<void> {
    const response = await apiClient.delete(`/api/projects/tasks/${taskId}`);
    if (response.error) throw new Error(response.error);
  }
}

export const projectsService = new ProjectsService();

