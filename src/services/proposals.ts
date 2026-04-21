import { apiClient } from '@/integrations/api/client';

export interface ProposalItem {
  id?: number | string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Desconto em BRL por linha (Etapa 2). */
  discount?: number;
  total: number;
}

export interface ProposalTimelineEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_user_id: string | null;
  created_at: string;
}

export type PostAcceptBillingMode = 'none' | 'notify_team' | 'auto_pending_invoice';

export interface Proposal {
  id: string;
  /** Criador da proposta (permissões edit_own / delete_own). */
  user_id?: string;
  /** Nome do cliente (lista/detalhe com JOIN; opcional em respostas antigas). */
  client_name?: string | null;
  client_id?: string | null;
  /** Proposta vinculada a lead (sem cliente CRM). Mutuamente exclusivo com `client_id` na API. */
  lead_id?: string | null;
  lead_name?: string | null;
  funnel_id?: string | null;
  stage_id?: string | null;
  title: string;
  description?: string | null;
  amount: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'invoiced';
  sent_date?: string | null;
  valid_until?: string | null;
  items: ProposalItem[];
  created_at?: string;
  updated_at?: string;
  converted_invoice_id?: string | null;
  converted_invoice_number?: string | null;
  responsible_email?: string | null;
  /** Etapa 4 — após aceite público (automação / notificação). */
  post_accept_billing_mode?: PostAcceptBillingMode;
  timeline?: ProposalTimelineEvent[];
  /** Caminho relativo `/proposal-view/...` (somente API autenticada; token cifrado no servidor). */
  public_link_path?: string | null;
}

export type ProposalOperationalSnippetKey =
  | 'initial_send'
  | 'reminder'
  | 'accepted_client_note'
  | 'rejected_client_note'
  | 'expired_client_note'
  | 'invoiced_internal_note';

export interface ProposalIntegrationEventRow {
  id: string;
  proposal_id: string;
  event_key: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ProposalWebhookDeliveryRow {
  id: string;
  tenant_id: string;
  integration_event_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_http_status: number | null;
  last_error: string | null;
  response_snippet: string | null;
  attempt_log: unknown;
  next_retry_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  event_key: string;
  event_created_at: string;
}

export interface ConvertProposalToInvoiceBody {
  due_date: string;
  payment_method?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null;
  allowed_payment_methods?: ('PIX' | 'BOLETO' | 'CREDIT_CARD')[] | null;
  gateway_key?: string | null;
}

export interface ProposalPublicLinkMeta {
  active: boolean;
  created_at: string | null;
  /** Presente quando o CRM consegue reidratar o token cifrado (igual ao GET da proposta). */
  path?: string | null;
}

export type ProposalListFilters = {
  status?: string;
  client_id?: string;
  lead_id?: string;
  funnel_id?: string;
  stage_id?: string;
  /** Busca em título e descrição (ILIKE). */
  q?: string;
  /** Filtra pelo criador/responsável (`proposals.user_id`). */
  owner_user_id?: string;
  /** `valid` = dentro do prazo ou sem validade; `expired` = data de validade já passou. */
  validity?: 'valid' | 'expired';
  /** `yes` = com fatura vinculada; `no` = sem conversão. */
  conversion?: 'yes' | 'no';
};

export const proposalsService = {
  async getProposals(filters?: ProposalListFilters): Promise<Proposal[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.client_id) params.append('client_id', filters.client_id);
    if (filters?.lead_id) params.append('lead_id', filters.lead_id);
    if (filters?.funnel_id) params.append('funnel_id', filters.funnel_id);
    if (filters?.stage_id) params.append('stage_id', filters.stage_id);
    if (filters?.q?.trim()) params.append('q', filters.q.trim());
    if (filters?.owner_user_id) params.append('owner_user_id', filters.owner_user_id);
    if (filters?.validity) params.append('validity', filters.validity);
    if (filters?.conversion) params.append('conversion', filters.conversion);

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

  async createProposal(
    proposal: Omit<Proposal, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Proposal & { public_link_path?: string | null }> {
    const response = await apiClient.post<Proposal & { public_link_path?: string | null }>('/api/proposals', {
      client_id: proposal.client_id || null,
      lead_id: proposal.lead_id || null,
      funnel_id: proposal.funnel_id || null,
      stage_id: proposal.stage_id || null,
      title: proposal.title,
      description: proposal.description || null,
      amount: proposal.amount,
      status: proposal.status ?? 'draft',
      sent_date: proposal.sent_date ?? null,
      valid_until: proposal.valid_until || null,
      items: proposal.items || [],
      post_accept_billing_mode: proposal.post_accept_billing_mode,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao criar proposta');
    return response.data;
  },

  async updateProposal(id: string, proposal: Partial<Proposal>): Promise<Proposal> {
    const response = await apiClient.patch<Proposal>(`/api/proposals/${id}`, {
      client_id: proposal.client_id,
      lead_id: proposal.lead_id,
      funnel_id: proposal.funnel_id,
      stage_id: proposal.stage_id,
      title: proposal.title,
      description: proposal.description,
      amount: proposal.amount,
      status: proposal.status,
      sent_date: proposal.sent_date,
      valid_until: proposal.valid_until,
      items: proposal.items,
      post_accept_billing_mode: proposal.post_accept_billing_mode,
    });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao atualizar proposta');
    return response.data;
  },

  async deleteProposal(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/proposals/${id}`);
    if (response.error) throw new Error(response.error);
  },

  async getProposalPublicLinkMeta(proposalId: string): Promise<ProposalPublicLinkMeta> {
    const response = await apiClient.get<ProposalPublicLinkMeta>(`/api/proposals/${proposalId}/public-link`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao consultar link');
    return response.data;
  },

  async issueProposalPublicLink(proposalId: string): Promise<{ token: string; path: string }> {
    const response = await apiClient.post<{ token: string; path: string }>(
      `/api/proposals/${proposalId}/public-link`,
      {}
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao gerar link');
    return response.data;
  },

  async revokeProposalPublicLink(proposalId: string): Promise<{ ok: boolean; revoked: number }> {
    const response = await apiClient.delete<{ ok: boolean; revoked: number }>(
      `/api/proposals/${proposalId}/public-link`
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao revogar link');
    return response.data;
  },

  async postProposalOperationalPreview(
    proposalId: string,
    body: { public_url?: string | null }
  ): Promise<{ snippets: Record<ProposalOperationalSnippetKey, { subject: string; body: string }> }> {
    const response = await apiClient.post<{ snippets: Record<ProposalOperationalSnippetKey, { subject: string; body: string }> }>(
      `/api/proposals/${proposalId}/operational-preview`,
      body ?? {}
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao montar mensagens');
    return response.data;
  },

  async getProposalIntegrationEvents(proposalId: string): Promise<{ events: ProposalIntegrationEventRow[] }> {
    const response = await apiClient.get<{ events: ProposalIntegrationEventRow[] }>(
      `/api/proposals/${proposalId}/integration-events`
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? { events: [] };
  },

  async getProposalWebhookDeliveries(proposalId: string): Promise<{ deliveries: ProposalWebhookDeliveryRow[] }> {
    const response = await apiClient.get<{ deliveries: ProposalWebhookDeliveryRow[] }>(
      `/api/proposals/${proposalId}/webhook-deliveries`
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? { deliveries: [] };
  },

  async convertProposalToInvoice(
    proposalId: string,
    body: ConvertProposalToInvoiceBody
  ): Promise<{ invoice: { id: string; invoice_number?: string | null } }> {
    const response = await apiClient.post<{ invoice: { id: string; invoice_number?: string | null } }>(
      `/api/proposals/${proposalId}/convert-to-invoice`,
      body
    );
    if (response.error) {
      const err = new Error(response.error) as Error & { apiCode?: string };
      err.apiCode = response.code;
      throw err;
    }
    if (!response.data) throw new Error('Erro ao gerar fatura');
    return response.data;
  },
};
