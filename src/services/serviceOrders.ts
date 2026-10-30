import { apiClient, getApiUrl } from '@/integrations/api/client';
import type {
  CreateServiceOrderInput,
  ListServiceOrdersParams,
  SendServiceOrderForSignatureResult,
  SendServiceOrderToClientResult,
  ServiceOrder,
  ServiceOrderListResponse,
  UpdateServiceOrderInput,
} from '@/types/serviceOrders';

export type ServiceOrderDocumentResponse = {
  html: string;
  model: Record<string, unknown>;
};

function buildQuery(params?: ListServiceOrdersParams): string {
  if (!params) return '';
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.client_id) q.set('client_id', params.client_id);
  if (params.responsible_user_id) q.set('responsible_user_id', params.responsible_user_id);
  if (params.created_by) q.set('created_by', params.created_by);
  if (params.q) q.set('q', params.q);
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const serviceOrdersService = {
  async list(params?: ListServiceOrdersParams): Promise<ServiceOrderListResponse> {
    const response = await apiClient.get<ServiceOrderListResponse>(
      `/api/service-orders${buildQuery(params)}`,
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? { data: [], total: 0, limit: 50, offset: 0 };
  },

  async getById(id: string): Promise<ServiceOrder> {
    const response = await apiClient.get<ServiceOrder>(`/api/service-orders/${id}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Ordem de serviço não encontrada');
    return response.data;
  },

  async create(body: CreateServiceOrderInput): Promise<ServiceOrder> {
    const response = await apiClient.post<ServiceOrder>('/api/service-orders', body);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta vazia ao criar ordem de serviço');
    return response.data;
  },

  async update(id: string, body: UpdateServiceOrderInput): Promise<ServiceOrder> {
    const response = await apiClient.patch<ServiceOrder>(`/api/service-orders/${id}`, body);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta vazia ao atualizar ordem de serviço');
    return response.data;
  },

  async remove(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/service-orders/${id}`);
    if (response.error) throw new Error(response.error);
  },

  async getDocument(id: string): Promise<ServiceOrderDocumentResponse> {
    const response = await apiClient.get<ServiceOrderDocumentResponse>(
      `/api/service-orders/${id}/document`,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.html) throw new Error('Documento não disponível');
    return response.data;
  },

  async sendToClient(
    id: string,
    body?: { regenerate?: boolean },
  ): Promise<SendServiceOrderToClientResult> {
    const response = await apiClient.post<SendServiceOrderToClientResult>(
      `/api/service-orders/${id}/send`,
      body ?? {},
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta vazia ao enviar OS');
    return response.data;
  },

  async sendForSignature(
    id: string,
    body?: { include_technician?: boolean; regenerate?: boolean },
  ): Promise<SendServiceOrderForSignatureResult> {
    const response = await apiClient.post<SendServiceOrderForSignatureResult>(
      `/api/service-orders/${id}/send-for-signature`,
      body ?? {},
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Resposta vazia ao enviar para assinatura');
    return response.data;
  },

  async revokeSignatureLinks(id: string): Promise<void> {
    const response = await apiClient.post(`/api/service-orders/${id}/revoke-signature-links`, {});
    if (response.error) throw new Error(response.error);
  },

  async reissueSignerInvite(
    id: string,
    signerId: string,
  ): Promise<{ token: string; frontend_path: string; expires_at: string | null }> {
    const response = await apiClient.post<{
      token: string;
      frontend_path: string;
      expires_at: string | null;
    }>(`/api/service-orders/${id}/signers/${signerId}/reissue-invite`, {});
    if (response.error) throw new Error(response.error);
    if (!response.data?.token) throw new Error('Falha ao reemitir convite');
    return response.data;
  },

  async updateSignerName(
    id: string,
    signerId: string,
    name: string,
  ): Promise<{ id: string; name: string; role: string }> {
    const response = await apiClient.patch<{ id: string; name: string; role: string }>(
      `/api/service-orders/${id}/signers/${signerId}`,
      { name },
    );
    if (response.error) throw new Error(response.error);
    if (!response.data?.id) throw new Error('Falha ao atualizar nome do técnico');
    return response.data;
  },

  async scheduleVisit(
    id: string,
    body: {
      title?: string | null;
      description?: string | null;
      type?: string;
      starts_at: string;
      ends_at: string;
      location?: string | null;
      responsible_user_id?: string | null;
      create_google_event?: boolean;
      create_meet?: boolean;
      send_reminder_to_client?: boolean;
    },
  ): Promise<{
    appointment: Record<string, unknown>;
    warnings: string[];
    order: ServiceOrder;
  }> {
    const response = await apiClient.post<{
      appointment: Record<string, unknown>;
      warnings: string[];
      order: ServiceOrder;
    }>(`/api/service-orders/${id}/schedule-visit`, body);
    if (response.error) {
      const err = new Error(response.error) as Error & { apiCode?: string };
      err.apiCode = response.code;
      throw err;
    }
    if (!response.data?.appointment) throw new Error('Falha ao marcar visita');
    return response.data;
  },

  async rescheduleVisit(
    id: string,
    body: {
      title?: string | null;
      starts_at: string;
      ends_at: string;
      location?: string | null;
      responsible_user_id?: string | null;
      create_google_event?: boolean;
      create_meet?: boolean;
      send_reminder_to_client?: boolean;
    },
  ): Promise<{
    appointment: Record<string, unknown>;
    warnings: string[];
    order: ServiceOrder;
  }> {
    const response = await apiClient.post<{
      appointment: Record<string, unknown>;
      warnings: string[];
      order: ServiceOrder;
    }>(`/api/service-orders/${id}/reschedule-visit`, body);
    if (response.error) {
      const err = new Error(response.error) as Error & { apiCode?: string };
      err.apiCode = response.code;
      throw err;
    }
    if (!response.data?.appointment) throw new Error('Falha ao remarcar visita');
    return response.data;
  },

  async convertToInvoice(
    id: string,
    body: { due_date: string; payment_method?: string | null; gateway_key?: string | null },
  ): Promise<{ invoice: { id: string; invoice_number?: string | null; payment_token?: string | null } }> {
    const response = await apiClient.post<{
      invoice: { id: string; invoice_number?: string | null; payment_token?: string | null };
    }>(`/api/service-orders/${id}/convert-to-invoice`, body);
    if (response.error) {
      const err = new Error(response.error) as Error & { apiCode?: string };
      err.apiCode = response.code;
      throw err;
    }
    if (!response.data?.invoice?.id) throw new Error('Erro ao gerar fatura');
    return response.data;
  },

  async downloadPdf(id: string, opts?: { freeze?: boolean }): Promise<void> {
    const base = getApiUrl();
    const token = apiClient.getToken();
    const freeze = opts?.freeze === false ? '0' : '1';
    const url = `${base}/api/service-orders/${id}/pdf?freeze=${freeze}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = 'Falha ao gerar PDF';
      try {
        const j = (await res.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition');
    let filename = 'ordem-servico.pdf';
    const m = cd?.match(/filename="([^"]+)"/i) || cd?.match(/filename=([^;]+)/i);
    if (m) filename = m[1].trim();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(u);
  },
};
