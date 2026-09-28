import { apiClient } from '@/integrations/api/client';
import type { ChatInstance } from '@/services/chat';

const BASE = '/api/superadmin/platform-whatsapp';

export const superadminPlatformWhatsAppService = {
  async listInstances(): Promise<ChatInstance[]> {
    const res = await apiClient.get<ChatInstance[]>(`${BASE}/instances`);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao listar instâncias.');
    return res.data;
  },

  async createInstance(payload: { name: string; metadata?: Record<string, unknown> }): Promise<ChatInstance> {
    const res = await apiClient.post<ChatInstance>(`${BASE}/instances`, payload);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao criar instância.');
    return res.data;
  },

  async connectInstance(
    id: string,
    body?: { phone?: string; reset_chat_history?: boolean; sync_on_connect?: boolean; sync_mode?: string },
  ): Promise<Record<string, unknown>> {
    const res = await apiClient.post<Record<string, unknown>>(`${BASE}/instances/${id}/connect`, body || {});
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao conectar.');
    return res.data;
  },

  async getInstanceStatus(id: string): Promise<Record<string, unknown>> {
    const res = await apiClient.get<Record<string, unknown>>(`${BASE}/instances/${id}/status`);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao obter estado.');
    return res.data;
  },

  async deleteInstance(id: string): Promise<void> {
    const res = await apiClient.delete(`${BASE}/instances/${id}`);
    if (res.error) throw new Error(res.error);
  },
};

/** Nome recomendado para não misturar com instâncias pessoais do mesmo utilizador. */
export const PLATFORM_WHATSAPP_INSTANCE_NAME = 'Plataforma — notificações automáticas';
