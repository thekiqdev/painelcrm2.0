import { apiClient } from '@/integrations/api/client';

export interface ProposalItem {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Proposal {
  id: string;
  client_id?: string | null;
  funnel_id?: string | null;
  stage_id?: string | null;
  title: string;
  description?: string | null;
  amount: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  sent_date?: string | null;
  valid_until?: string | null;
  items: ProposalItem[];
  created_at?: string;
  updated_at?: string;
}

export const proposalsService = {
  async getProposals(filters?: { status?: string; client_id?: string; funnel_id?: string; stage_id?: string }): Promise<Proposal[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.client_id) params.append('client_id', filters.client_id);
    if (filters?.funnel_id) params.append('funnel_id', filters.funnel_id);
    if (filters?.stage_id) params.append('stage_id', filters.stage_id);
    
    const query = params.toString();
    const response = await apiClient.get<Proposal[]>(`/api/proposals${query ? `?${query}` : ''}`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },

  async getProposalById(id: string): Promise<Proposal> {
    const response = await apiClient.get<Proposal>(`/api/proposals/${id}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Proposta não encontrada');
    return response.data;
  },

  async createProposal(proposal: Omit<Proposal, 'id' | 'created_at' | 'updated_at'>): Promise<Proposal> {
    const response = await apiClient.post<Proposal>('/api/proposals', {
      client_id: proposal.client_id || null,
      funnel_id: proposal.funnel_id || null,
      stage_id: proposal.stage_id || null,
      title: proposal.title,
      description: proposal.description || null,
      amount: proposal.amount,
      status: proposal.status || 'draft',
      sent_date: proposal.sent_date || null,
      valid_until: proposal.valid_until || null,
      items: proposal.items || [],
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao criar proposta');
    return response.data;
  },

  async updateProposal(id: string, proposal: Partial<Proposal>): Promise<Proposal> {
    const response = await apiClient.patch<Proposal>(`/api/proposals/${id}`, {
      client_id: proposal.client_id,
      funnel_id: proposal.funnel_id,
      stage_id: proposal.stage_id,
      title: proposal.title,
      description: proposal.description,
      amount: proposal.amount,
      status: proposal.status,
      sent_date: proposal.sent_date,
      valid_until: proposal.valid_until,
      items: proposal.items,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao atualizar proposta');
    return response.data;
  },

  async deleteProposal(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/proposals/${id}`);
    if (response.error) throw new Error(response.error);
  },
};

