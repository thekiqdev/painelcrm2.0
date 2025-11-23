import { apiClient } from '@/integrations/api/client';

export interface KPIData {
  sales: { value: number; change: number; changeType: 'positive' | 'negative' };
  leads: { value: number; change: number; changeType: 'positive' | 'negative' };
  proposals: { value: number; change: number; changeType: 'positive' | 'negative' };
  tasks: { value: number; change: number; changeType: 'positive' | 'negative' };
}

export interface ChartData {
  name: string;
  value: number;
}

export interface FunnelData {
  name: string;
  value: number;
  color: string;
}

export interface Activity {
  user: string;
  action: string;
  entity: string;
  time: string;
  color: string;
}

export interface UpcomingTask {
  id: string;
  title: string;
  time: string;
  priority: string;
  color: string;
}

export const dashboardService = {
  async getKPIs(): Promise<KPIData> {
    const response = await apiClient.get<KPIData>('/api/dashboard/kpis');
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao buscar KPIs');
    return response.data;
  },

  async getSalesChart(): Promise<ChartData[]> {
    const response = await apiClient.get<ChartData[]>('/api/dashboard/charts/sales');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getLeadsChart(): Promise<ChartData[]> {
    const response = await apiClient.get<ChartData[]>('/api/dashboard/charts/leads');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getFunnelData(): Promise<FunnelData[]> {
    const response = await apiClient.get<FunnelData[]>('/api/dashboard/funnel');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getRecentActivities(): Promise<Activity[]> {
    const response = await apiClient.get<Activity[]>('/api/dashboard/activities');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getUpcomingTasks(): Promise<UpcomingTask[]> {
    const response = await apiClient.get<UpcomingTask[]>('/api/dashboard/tasks');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },
};

