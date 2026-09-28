import { apiClient } from '@/integrations/api/client';

export interface ProjectArea {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface AreaComment {
  id: string;
  area_id: string;
  user_id: string;
  body: string | null;
  deleted_at: string | null;
  created_at: string;
  author_name: string;
  author_email?: string;
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
  /** Preenchido quando a API incluir join com cliente (opcional). */
  client_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  responsible_ids?: string[];
  team_id?: string | null;
  team_ids?: string[];
  areas?: ProjectArea[];
  versions?: ProjectVersion[];
}

export interface ProjectVersionMetrics {
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  open_tasks?: number;
  feature_tasks?: number;
  fix_tasks?: number;
  improvement_tasks?: number;
  internal_tasks?: number;
  days_remaining?: number | null;
  ready_to_publish?: boolean;
}

export interface ProjectVersion {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: 'planning' | 'development' | 'qa' | 'published' | 'archived';
  start_date: string | null;
  due_date: string | null;
  release_date: string | null;
  is_default: boolean;
  sort_order: number;
  published_at: string | null;
  published_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  release_notes: string | null;
  frozen: boolean;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
  metrics: ProjectVersionMetrics;
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
  version_id?: string | null;
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
  include_in_release_notes?: boolean;
  release_note_type?: 'feature' | 'fix' | 'improvement' | 'internal' | null;
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
    team_ids?: string[];
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
      team_ids?: string[];
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
    data: { name?: string; sort_order?: number; responsible_ids?: string[]; team_ids?: string[] }
  ): Promise<ProjectArea> {
    const response = await apiClient.patch<ProjectArea>(`/api/projects/areas/${areaId}`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteProjectArea(areaId: string): Promise<void> {
    const response = await apiClient.delete(`/api/projects/areas/${areaId}`);
    if (response.error) throw new Error(response.error);
  }

  async getProjectVersions(projectId: string, includeArchived = false): Promise<ProjectVersion[]> {
    const query = includeArchived ? '?includeArchived=true' : '';
    const response = await apiClient.get<ProjectVersion[]>(`/api/projects/${projectId}/versions${query}`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createProjectVersion(
    projectId: string,
    data: {
      name: string;
      description?: string | null;
      start_date?: string | null;
      due_date?: string | null;
      status?: ProjectVersion['status'];
    },
  ): Promise<ProjectVersion> {
    const response = await apiClient.post<ProjectVersion>(`/api/projects/${projectId}/versions`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async updateProjectVersion(
    projectId: string,
    versionId: string,
    data: {
      name?: string;
      description?: string | null;
      status?: ProjectVersion['status'];
      start_date?: string | null;
      due_date?: string | null;
      release_date?: string | null;
      is_default?: boolean;
      sort_order?: number;
      release_notes?: string | null;
      frozen?: boolean;
    },
  ): Promise<ProjectVersion> {
    const response = await apiClient.patch<ProjectVersion>(
      `/api/projects/${projectId}/versions/${versionId}`,
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async archiveProjectVersion(projectId: string, versionId: string): Promise<ProjectVersion> {
    const response = await apiClient.patch<ProjectVersion>(
      `/api/projects/${projectId}/versions/${versionId}/archive`,
      {},
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async unarchiveProjectVersion(projectId: string, versionId: string): Promise<ProjectVersion> {
    const response = await apiClient.patch<ProjectVersion>(
      `/api/projects/${projectId}/versions/${versionId}/unarchive`,
      {},
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteProjectVersion(projectId: string, versionId: string): Promise<void> {
    const response = await apiClient.delete(`/api/projects/${projectId}/versions/${versionId}`);
    if (response.error) throw new Error(response.error);
  }

  async publishProjectVersion(
    projectId: string,
    versionId: string,
    data: {
      move_incomplete_to_version_id?: string | null;
      archive_after_publish?: boolean;
      freeze_version?: boolean;
      generate_release_notes?: boolean;
    },
  ): Promise<ProjectVersion> {
    const response = await apiClient.post<ProjectVersion>(
      `/api/projects/${projectId}/versions/${versionId}/publish`,
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async duplicateProjectVersion(
    projectId: string,
    versionId: string,
    data: {
      name: string;
      copy_open_tasks?: boolean;
      copy_completed_tasks?: boolean;
      copy_checklists?: boolean;
    },
  ): Promise<ProjectVersion> {
    const response = await apiClient.post<ProjectVersion>(
      `/api/projects/${projectId}/versions/${versionId}/duplicate`,
      data,
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  /** Comentários da área (estilo rede social). */
  async getAreaComments(projectId: string, areaId: string): Promise<AreaComment[]> {
    const response = await apiClient.get<AreaComment[]>(`/api/projects/${projectId}/areas/${areaId}/comments`);
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  }

  async createAreaComment(projectId: string, areaId: string, body: string): Promise<AreaComment> {
    const response = await apiClient.post<AreaComment>(`/api/projects/${projectId}/areas/${areaId}/comments`, { body });
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteAreaComment(projectId: string, areaId: string, commentId: string): Promise<void> {
    const response = await apiClient.delete(`/api/projects/${projectId}/areas/${areaId}/comments/${commentId}`);
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
  async getProjectTasks(
    listId: string,
    options?: { areaId?: string; versionId?: string },
  ): Promise<ProjectTask[]> {
    const params = new URLSearchParams();
    if (options?.areaId) params.set('areaId', options.areaId);
    if (options?.versionId) params.set('versionId', options.versionId);
    const query = params.toString();
    const url = query ? `/api/projects/lists/${listId}/tasks?${query}` : `/api/projects/lists/${listId}/tasks`;
    const response = await apiClient.get<ProjectTask[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async getProjectTasksByArea(
    projectId: string,
    areaId: string,
    options?: { versionId?: string },
  ): Promise<ProjectTask[]> {
    const query = options?.versionId ? `?versionId=${encodeURIComponent(options.versionId)}` : '';
    const response = await apiClient.get<ProjectTask[]>(
      `/api/projects/${projectId}/areas/${areaId}/tasks${query}`,
    );
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
      version_id?: string | null;
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
      include_in_release_notes?: boolean;
      release_note_type?: 'feature' | 'fix' | 'improvement' | 'internal' | null;
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
      area_id?: string | null;
      version_id?: string | null;
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
      include_in_release_notes?: boolean;
      release_note_type?: 'feature' | 'fix' | 'improvement' | 'internal' | null;
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

  async moveProjectTask(
    taskId: string,
    data: {
      list_id: string;
      version_id?: string | null;
      area_id?: string | null;
    },
  ): Promise<ProjectTask> {
    const response = await apiClient.patch<ProjectTask>(`/api/projects/tasks/${taskId}/move`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async copyProjectTask(
    taskId: string,
    data: {
      version_id: string;
      list_id: string;
      area_id?: string | null;
      copy_checklist?: boolean;
      copy_assignee?: boolean;
      copy_due_date?: boolean;
      copy_metadata?: boolean;
    },
  ): Promise<ProjectTask> {
    const response = await apiClient.post<ProjectTask>(`/api/projects/tasks/${taskId}/copy`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }
}

export const projectsService = new ProjectsService();

