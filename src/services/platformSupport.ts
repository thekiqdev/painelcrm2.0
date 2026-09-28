import { apiClient } from '@/integrations/api/client';
import type {
  PlatformSupportMessage,
  PlatformSupportPublicSettings,
  PlatformSupportTicket,
} from '@/types/platformSupport';

const base = '/api/platform-support';
const adminBase = '/api/superadmin/platform-support';

export const platformSupportService = {
  async getPublicSettings(): Promise<PlatformSupportPublicSettings> {
    const res = await apiClient.get<PlatformSupportPublicSettings>(`${base}/settings/public`);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao carregar suporte');
    return res.data;
  },

  async listTickets(): Promise<PlatformSupportTicket[]> {
    const res = await apiClient.get<PlatformSupportTicket[]>(`${base}/tickets`);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao listar chamados');
    return res.data;
  },

  async createTicket(payload: {
    subject: string;
    category: string;
    priority: string;
    message: string;
  }): Promise<PlatformSupportTicket> {
    const res = await apiClient.post<PlatformSupportTicket>(`${base}/tickets`, payload);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao abrir chamado');
    return res.data;
  },

  async getTicket(id: string): Promise<{ ticket: PlatformSupportTicket; messages: PlatformSupportMessage[] }> {
    const res = await apiClient.get<{ ticket: PlatformSupportTicket; messages: PlatformSupportMessage[] }>(
      `${base}/tickets/${id}`,
    );
    if (res.error || !res.data) throw new Error(res.error || 'Chamado não encontrado');
    return res.data;
  },

  async postMessage(ticketId: string, message: string): Promise<PlatformSupportMessage> {
    const res = await apiClient.post<PlatformSupportMessage>(`${base}/tickets/${ticketId}/messages`, { message });
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao enviar mensagem');
    return res.data;
  },
};

export type SuperadminPlatformSupportSettings = {
  support_enabled: boolean;
  whatsapp_number: string | null;
  whatsapp_message_template: string;
};

export type SuperadminPlatformSupportSummary = {
  open: number;
  waiting_support: number;
  waiting_customer: number;
  urgent: number;
  resolved_today: number;
  latest: {
    id: string;
    subject: string;
    tenant_name: string;
    created_at: string;
  } | null;
};

export const superadminPlatformSupportService = {
  async getSettings(): Promise<SuperadminPlatformSupportSettings> {
    const res = await apiClient.get<SuperadminPlatformSupportSettings>(`${adminBase}/settings`);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao carregar configurações');
    return res.data;
  },

  async saveSettings(payload: Partial<SuperadminPlatformSupportSettings>): Promise<SuperadminPlatformSupportSettings> {
    const res = await apiClient.put<SuperadminPlatformSupportSettings>(`${adminBase}/settings`, payload);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao salvar');
    return res.data;
  },

  async getSummary(): Promise<SuperadminPlatformSupportSummary> {
    const res = await apiClient.get<SuperadminPlatformSupportSummary>(`${adminBase}/summary`);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao carregar resumo de suporte');
    return res.data;
  },

  async listTickets(params?: Record<string, string>): Promise<PlatformSupportTicket[]> {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    const res = await apiClient.get<PlatformSupportTicket[]>(`${adminBase}/tickets${qs}`);
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao listar chamados');
    return res.data;
  },

  async getTicket(id: string): Promise<{ ticket: PlatformSupportTicket; messages: PlatformSupportMessage[] }> {
    const res = await apiClient.get<{ ticket: PlatformSupportTicket; messages: PlatformSupportMessage[] }>(
      `${adminBase}/tickets/${id}`,
    );
    if (res.error || !res.data) throw new Error(res.error || 'Chamado não encontrado');
    return res.data;
  },

  async postMessage(ticketId: string, message: string): Promise<PlatformSupportMessage> {
    const res = await apiClient.post<PlatformSupportMessage>(`${adminBase}/tickets/${ticketId}/messages`, {
      message,
    });
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao enviar resposta');
    return res.data;
  },

  async updateStatus(ticketId: string, status: string): Promise<PlatformSupportTicket> {
    const res = await apiClient.put<PlatformSupportTicket>(`${adminBase}/tickets/${ticketId}/status`, { status });
    if (res.error || !res.data) throw new Error(res.error || 'Falha ao atualizar status');
    return res.data;
  },
};
