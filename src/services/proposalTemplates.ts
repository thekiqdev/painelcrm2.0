import { apiClient } from '@/integrations/api/client';
import type { PostAcceptBillingMode, ProposalItem } from '@/services/proposals';

export type ProposalTemplate = {
  id: string;
  user_id?: string;
  name: string;
  default_title?: string | null;
  description?: string | null;
  amount: number;
  items: ProposalItem[];
  funnel_id?: string | null;
  stage_id?: string | null;
  post_accept_billing_mode?: PostAcceptBillingMode;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProposalTemplatePayload = {
  name: string;
  default_title?: string | null;
  description?: string | null;
  amount: number;
  items: ProposalItem[];
  funnel_id?: string | null;
  stage_id?: string | null;
  post_accept_billing_mode?: PostAcceptBillingMode;
  is_active?: boolean;
};

export const proposalTemplatesService = {
  async list(opts?: { activeOnly?: boolean }): Promise<ProposalTemplate[]> {
    const q = opts?.activeOnly ? '?activeOnly=true' : '';
    const res = await apiClient.get<ProposalTemplate[]>(`/api/proposal-templates${q}`);
    if (res.error) throw new Error(res.error);
    return res.data || [];
  },

  async getById(id: string): Promise<ProposalTemplate> {
    const res = await apiClient.get<ProposalTemplate>(`/api/proposal-templates/${id}`);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Modelo não encontrado');
    return res.data;
  },

  async create(body: ProposalTemplatePayload): Promise<ProposalTemplate> {
    const res = await apiClient.post<ProposalTemplate>('/api/proposal-templates', body);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Erro ao criar modelo');
    return res.data;
  },

  async update(id: string, body: Partial<ProposalTemplatePayload>): Promise<ProposalTemplate> {
    const res = await apiClient.patch<ProposalTemplate>(`/api/proposal-templates/${id}`, body);
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Erro ao atualizar modelo');
    return res.data;
  },

  async delete(id: string): Promise<void> {
    const res = await apiClient.delete(`/api/proposal-templates/${id}`);
    if (res.error) throw new Error(res.error);
  },
};
