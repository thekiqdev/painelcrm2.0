import { apiClient } from '@/integrations/api/client';

const BASE = '/api/superadmin/connections';

export type ConnectionsSummary = {
  whatsapp_official: {
    feature_enabled: boolean;
    tenant_feature_enabled: boolean;
    connected: boolean;
    status: string | null;
    display_phone_number: string | null;
    business_account_id: string | null;
    verified_name: string | null;
    phone_number_id: string | null;
    is_active: boolean | null;
  };
  uazapi: {
    instances_count: number;
    connected_count: number;
    designated_instance_id: string | null;
    instances: Array<{ id: string; name: string; status: string; connected_phone?: string | null }>;
  };
};

export const connectionsService = {
  async getSummary(): Promise<ConnectionsSummary> {
    const res = await apiClient.get<ConnectionsSummary>(`${BASE}/`);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao carregar conexões.');
    return res.data;
  },

  async putFlag(key: 'whatsapp_official_enabled' | 'whatsapp_official_tenant_enabled', value: boolean): Promise<void> {
    const res = await apiClient.put(`${BASE}/flags`, { key, value });
    if (res.error) throw new Error(res.error);
  },

  async disconnectWhatsappOfficial(): Promise<void> {
    const res = await apiClient.post(`${BASE}/whatsapp-official/disconnect`, {});
    if (res.error) throw new Error(res.error);
  },
};
