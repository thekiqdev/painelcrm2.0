import { apiClient } from '@/integrations/api/client';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TemplateStage {
  id: string;
  template_id: string;
  name: string;
  order_position: number;
  offset_days: number;
  created_at: string;
  tasks: TemplateTask[];
}

export interface TemplateTask {
  id: string;
  stage_id: string;
  title: string;
  description: string | null;
  offset_days: number;
  duration_days: number;
  priority: string;
  role: string | null;
  tags: string[];
  created_at: string;
}

export class ProjectTemplatesService {
  async getTemplates(): Promise<ProjectTemplate[]> {
    const response = await apiClient.get<ProjectTemplate[]>('/api/project-templates');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async getTemplateById(id: string): Promise<ProjectTemplate> {
    const response = await apiClient.get<ProjectTemplate>(`/api/project-templates/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async createTemplate(data: {
    name: string;
    description?: string | null;
    tags?: string[];
  }): Promise<ProjectTemplate> {
    const response = await apiClient.post<ProjectTemplate>('/api/project-templates', data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async updateTemplate(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      tags?: string[];
    }
  ): Promise<ProjectTemplate> {
    const response = await apiClient.patch<ProjectTemplate>(`/api/project-templates/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteTemplate(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/project-templates/${id}`);
    if (response.error) throw new Error(response.error);
  }

  async getTemplateStages(templateId: string): Promise<TemplateStage[]> {
    const response = await apiClient.get<TemplateStage[]>(
      `/api/project-templates/${templateId}/stages`
    );
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createTemplateStage(
    templateId: string,
    data: {
      name: string;
      order_position: number;
      offset_days?: number;
    }
  ): Promise<TemplateStage> {
    const response = await apiClient.post<TemplateStage>(
      `/api/project-templates/${templateId}/stages`,
      data
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async createTemplateTask(
    stageId: string,
    data: {
      title: string;
      description?: string | null;
      offset_days?: number;
      duration_days?: number;
      priority?: string;
      role?: string | null;
      tags?: string[];
    }
  ): Promise<TemplateTask> {
    const response = await apiClient.post<TemplateTask>(
      `/api/project-templates/stages/${stageId}/tasks`,
      data
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  }
}

export const projectTemplatesService = new ProjectTemplatesService();


