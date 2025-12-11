import { apiClient } from '@/integrations/api/client';

export interface MessageTemplate {
  id: string;
  user_id: string;
  name: string;
  resource_type: 'invoices' | 'contracts' | 'tasks' | 'tickets' | 'projects' | 'project_tasks' | 'leads' | 'clients' | 'proposals' | 'expenses' | 'funnels' | 'system';
  action: string;
  subject?: string | null;
  body: string;
  is_predefined: boolean;
  is_active: boolean;
  variables?: string[];
  created_at?: string;
  updated_at?: string;
  // Campos legados para compatibilidade
  type?: string;
}

export interface CreateMessageTemplateParams {
  name: string;
  resource_type: 'invoices' | 'contracts' | 'tasks' | 'tickets' | 'projects' | 'project_tasks' | 'leads' | 'clients' | 'proposals' | 'expenses' | 'funnels' | 'system';
  action: string;
  subject?: string | null;
  body: string;
  is_predefined?: boolean;
  is_active?: boolean;
  variables?: string[];
}

export interface UpdateMessageTemplateParams {
  name?: string;
  resource_type?: 'invoices' | 'contracts' | 'tasks' | 'tickets' | 'projects' | 'project_tasks' | 'leads' | 'clients' | 'proposals' | 'expenses' | 'funnels' | 'system';
  action?: string;
  subject?: string | null;
  body?: string;
  is_active?: boolean;
  variables?: string[];
}

export interface ResourceTypesResponse {
  resource_types: string[];
  actions: Record<string, string[]>;
}

export const messageTemplatesService = {
  async list(params?: { resource_type?: string; action?: string; is_predefined?: boolean }): Promise<MessageTemplate[]> {
    const queryParams = new URLSearchParams();
    if (params?.resource_type) queryParams.append('resource_type', params.resource_type);
    if (params?.action) queryParams.append('action', params.action);
    if (params?.is_predefined !== undefined) queryParams.append('is_predefined', params.is_predefined.toString());

    const url = `/api/message-templates${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiClient.get<MessageTemplate[]>(url);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  async getResourceTypes(): Promise<ResourceTypesResponse> {
    const response = await apiClient.get<ResourceTypesResponse>('/api/message-templates/resources');
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  },

  async getById(id: string): Promise<MessageTemplate> {
    const response = await apiClient.get<MessageTemplate>(`/api/message-templates/${id}`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  },

  async create(params: CreateMessageTemplateParams): Promise<MessageTemplate> {
    const response = await apiClient.post<MessageTemplate>('/api/message-templates', params);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  },

  async update(id: string, params: UpdateMessageTemplateParams): Promise<MessageTemplate> {
    const response = await apiClient.patch<MessageTemplate>(`/api/message-templates/${id}`, params);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  },

  async delete(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/message-templates/${id}`);
    if (response.error) {
      throw new Error(response.error);
    }
  },

  async initializePredefined(): Promise<{ message: string; created: number; templates: MessageTemplate[] }> {
    const response = await apiClient.post<{ message: string; created: number; templates: MessageTemplate[] }>(
      '/api/message-templates/initialize-predefined'
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  },

  async test(id: string, phoneNumber: string, variables?: Record<string, string>): Promise<{ success: boolean; message?: string; error?: string; preview?: string; phoneNumber?: string }> {
    const response = await apiClient.post<{ success: boolean; message?: string; error?: string; preview?: string; phoneNumber?: string }>(
      `/api/message-templates/${id}/test`,
      { phoneNumber, variables }
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  },
};
