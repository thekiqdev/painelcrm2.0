import { apiClient } from '@/integrations/api/client';
import { normalizeClientFinancialSummary } from '@/utils/clientFinancialSummary';
import { recordClientTimelineEvent } from './clientTimeline';

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
  cpf_cnpj?: string | null;
  /** Foto WhatsApp derivada da conversa vinculada (API GET /api/clients). */
  whatsapp_avatar_url?: string | null;
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

export interface ClientFinancialSummary {
  invoices_count: number;
  open_amount_cents: number;
  paid_amount_cents: number;
  overdue_amount_cents: number;
  average_ticket_cents: number | null;
  last_invoice_amount_cents: number | null;
  last_invoice_status: string | null;
  /** Propostas aceitas ou faturadas (CRM). */
  proposals_accepted_count: number;
  proposals_accepted_amount_cents: number;
  /** Propostas em rascunho ou enviadas (ainda não aceitas). */
  proposals_pending_count: number;
  proposals_pending_amount_cents: number;
  currency: string;
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

export type ClientTimelineEventName =
  | 'chat_match_client_success'
  | 'chat_link_manual'
  | 'chat_link_auto_effective'
  | 'chat_link_migrated_lead_to_client'
  | 'chat_invoice_sent'
  | 'chat_invoice_created'
  | 'chat_proposal_created'
  | 'chat_proposal_draft_saved'
  | 'chat_contract_draft_saved'
  | 'chat_contract_sent_for_signature'
  | 'chat_appointment_scheduled'
  | 'invoice_paid'
  | 'agenda_appointment_created'
  | 'agenda_appointment_updated'
  | 'agenda_appointment_cancelled'
  | 'agenda_appointment_rescheduled'
  | 'agenda_attendance_confirmed'
  | 'agenda_attendance_not_confirmed'
  | 'agenda_attendance_no_show'
  | 'agenda_confirmation_requested'
  | 'agenda_public_confirmation_confirmed'
  | 'agenda_public_confirmation_needs_reschedule'
  | 'agenda_public_confirmation_declined'
  | 'agenda_public_rescheduled'
  | 'agenda_appointment_completed'
  | 'agenda_appointment_follow_up_created';

export interface ClientTimelineEvent {
  id: string;
  tenant_id: string;
  client_id: string;
  event_name: ClientTimelineEventName;
  source: string;
  actor_type: 'user' | 'system' | 'integration';
  actor_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  event_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Parâmetros opcionais de listagem (Fase 2 — busca B1). */
export interface GetClientsParams {
  profileId?: string;
  /** Busca no servidor (nome, empresa, e-mail, telefone, CPF/CNPJ); limita a 50 resultados. */
  q?: string;
}

export type CreateClientTimelineEventBody = {
  event_name: ClientTimelineEventName;
  source: string;
  actor_type?: 'user' | 'system' | 'integration';
  actor_id?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  event_key?: string | null;
  metadata?: Record<string, unknown>;
};

export class ClientsService {
  /**
   * Lista clientes do tenant.
   * - `getClients()` — todos (comportamento anterior).
   * - `getClients('uuid')` — filtro por perfil (string = profileId).
   * - `getClients({ q, profileId })` — busca e/ou perfil.
   */
  async getClients(paramsOrProfileId?: string | GetClientsParams): Promise<Client[]> {
    const search = new URLSearchParams();
    if (typeof paramsOrProfileId === 'string') {
      search.set('profileId', paramsOrProfileId);
    } else if (paramsOrProfileId && typeof paramsOrProfileId === 'object') {
      if (paramsOrProfileId.profileId) search.set('profileId', paramsOrProfileId.profileId);
      if (paramsOrProfileId.q?.trim()) search.set('q', paramsOrProfileId.q.trim());
    }
    const qs = search.toString();
    const url = qs ? `/api/clients?${qs}` : '/api/clients';
    const response = await apiClient.get<Client[]>(url);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async getClientById(id: string): Promise<Client | null> {
    const response = await apiClient.get<Client>(`/api/clients/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data || null;
  }

  async getClientFinancialSummary(clientId: string): Promise<ClientFinancialSummary> {
    const response = await apiClient.get<ClientFinancialSummary>(
      `/api/clients/${encodeURIComponent(clientId)}/financial-summary`,
    );

    if (!response.error && response.data != null) {
      return normalizeClientFinancialSummary(response.data);
    }

    const status =
      response.details && typeof response.details === 'object' && response.details !== null && 'status' in response.details
        ? Number((response.details as { status?: unknown }).status)
        : NaN;

    /** Sem permissão ou cliente não encontrado: não propagar como falha da query — UI usa valores zerados. */
    if (status === 404 || status === 403 || status === 401) {
      return normalizeClientFinancialSummary(null);
    }

    if (!response.error && response.data == null) {
      return normalizeClientFinancialSummary(null);
    }

    if (response.error) {
      throw new Error(response.error);
    }

    return normalizeClientFinancialSummary(null);
  }

  async getClientTimeline(clientId: string, params?: { limit?: number; offset?: number }): Promise<ClientTimelineEvent[]> {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.offset != null) search.set('offset', String(params.offset));
    const qs = search.toString();
    const response = await apiClient.get<ClientTimelineEvent[]>(
      `/api/clients/${clientId}/timeline${qs ? `?${qs}` : ''}`
    );
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createTimelineEvent(clientId: string, body: CreateClientTimelineEventBody): Promise<void> {
    return recordClientTimelineEvent(clientId, body);
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


