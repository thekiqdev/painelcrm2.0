import { apiClient } from '@/integrations/api/client';

export interface ProjectArea {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

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
  project_type?: 'simple' | 'areas' | 'advanced' | 'template';
  template_id?: string | null;
  source_template_id?: string | null;
  client_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  responsible_ids?: string[];
  team_id?: string | null;
  areas?: ProjectArea[];
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
  area_id?: string | null;
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
  // Projetos (teamId opcional: filtra por equipe)
  async getProjects(teamId?: string | null): Promise<Project[]> {
    const url = teamId ? `/api/projects?team_id=${encodeURIComponent(teamId)}` : '/api/projects';
    const response = await apiClient.get<Project[]>(url);
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
    project_type?: 'simple' | 'areas' | 'advanced' | 'template';
    template_id?: string | null;
    client_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    responsible_ids?: string[];
    team_id?: string | null;
    initial_areas?: string[];
    create_first_version?: boolean;
    first_version_name?: string | null;
    first_version_date?: string | null;
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
      team_id?: string | null;
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

  // Áreas do projeto (tipos areas e advanced)
  async getProjectAreas(projectId: string): Promise<ProjectArea[]> {
    const response = await apiClient.get<ProjectArea[]>(`/api/projects/${projectId}/areas`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createProjectArea(
    projectId: string,
    data: { name: string; sort_order?: number }
  ): Promise<ProjectArea> {
    const response = await apiClient.post<ProjectArea>(`/api/projects/${projectId}/areas`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async updateProjectArea(
    areaId: string,
    data: { name?: string; sort_order?: number; responsible_ids?: string[] }
  ): Promise<ProjectArea> {
    const response = await apiClient.patch<ProjectArea>(`/api/projects/areas/${areaId}`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteProjectArea(areaId: string): Promise<void> {
    const response = await apiClient.delete(`/api/projects/areas/${areaId}`);
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
  async getProjectTasks(listId: string, options?: { areaId?: string }): Promise<ProjectTask[]> {
    const url = options?.areaId
      ? `/api/projects/lists/${listId}/tasks?areaId=${encodeURIComponent(options.areaId)}`
      : `/api/projects/lists/${listId}/tasks`;
    const response = await apiClient.get<ProjectTask[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async getProjectTasksByArea(projectId: string, areaId: string): Promise<ProjectTask[]> {
    const response = await apiClient.get<ProjectTask[]>(`/api/projects/${projectId}/areas/${areaId}/tasks`);
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
      area_id?: string | null;
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
      list_id?: string;
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

