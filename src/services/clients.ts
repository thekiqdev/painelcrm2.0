import { apiClient } from '@/integrations/api/client';

export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  funnel_stage?: string;
  notes?: string;
  group_id?: string;
  profile_id?: string;
  client_groups?: { id: string; name: string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface ClientGroup {
  id: string;
  name: string;
  user_id: string;
  clientCount?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ClientTask {
  id: string;
  client_id: string;
  title: string;
  description?: string;
  due_date?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export class ClientsService {
  async getClients(profileId?: string): Promise<Client[]> {
    const url = profileId ? `/api/clients?profileId=${profileId}` : '/api/clients';
    const response = await apiClient.get<Client[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async getClientById(id: string): Promise<Client | null> {
    const response = await apiClient.get<Client>(`/api/clients/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data || null;
  }

  async createClient(clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<Client> {
    const response = await apiClient.post<Client>('/api/clients', clientData);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    return response.data;
  }

  async updateClient(id: string, clientData: Partial<Client>): Promise<Client> {
    const response = await apiClient.patch<Client>(`/api/clients/${id}`, clientData);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    return response.data;
  }

  async deleteClient(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/clients/${id}`);
    if (response.error) throw new Error(response.error);
  }

  async getClientTasks(clientId: string): Promise<ClientTask[]> {
    const response = await apiClient.get<ClientTask[]>(`/api/clients/${clientId}/tasks`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createClientTask(taskData: Omit<ClientTask, 'id' | 'created_at' | 'updated_at'>): Promise<ClientTask> {
    const response = await apiClient.post<ClientTask>('/api/clients/tasks', taskData);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    return response.data;
  }

  async updateClientTask(taskId: string, taskData: Partial<ClientTask>): Promise<ClientTask> {
    const response = await apiClient.patch<ClientTask>(`/api/clients/tasks/${taskId}`, taskData);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    return response.data;
  }

  async deleteClientTask(taskId: string): Promise<void> {
    const response = await apiClient.delete(`/api/clients/tasks/${taskId}`);
    if (response.error) throw new Error(response.error);
  }

  // Client Groups
  async getClientGroups(): Promise<ClientGroup[]> {
    const response = await apiClient.get<ClientGroup[]>('/api/client-groups');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createClientGroup(groupData: { name: string }): Promise<ClientGroup> {
    const response = await apiClient.post<ClientGroup>('/api/client-groups', groupData);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    return response.data;
  }

  async updateClientGroup(id: string, groupData: { name: string }): Promise<ClientGroup> {
    const response = await apiClient.patch<ClientGroup>(`/api/client-groups/${id}`, groupData);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    return response.data;
  }

  async deleteClientGroup(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/client-groups/${id}`);
    if (response.error) throw new Error(response.error);
  }
}

export const clientsService = new ClientsService();


