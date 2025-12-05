import { apiClient } from '@/integrations/api/client';

export interface ChatInstance {
  id: string;
  user_id: string;
  name: string;
  external_instance_name?: string | null;
  instance_token?: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ChatConversation {
  id: string;
  user_id: string;
  instance_id: string;
  instance_name?: string;
  client_id?: string | null;
  external_chat_id: string;
  contactName?: string | null;
  profileName?: string | null;
  phoneNumber?: string | null;
  /**
   * URL da foto/avatar do contato (derivada do metadata.image / imagePreview da UazAPI)
   */
  avatarUrl?: string | null;
  /**
   * Usuário atualmente responsável pela conversa
   */
  assignedTo?: string | null;
  /**
   * Fila/time lógico (ex.: suporte, comercial)
   */
  queue?: string | null;
  /**
   * Lead associado (derivado via telefone na tabela leads)
   */
  leadId?: string | null;
  status?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  metadata?: Record<string, unknown> | null;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  direction: 'incoming' | 'outgoing';
  external_message_id?: string | null;
  body?: string | null;
  status?: string | null;
  sentAt?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

const normalizeConversation = (raw: any): ChatConversation => {
  const metadata = raw.metadata || {};

  const avatarUrl =
    // Campos diretos na tabela (caso venham a existir)
    raw.image ||
    raw.image_preview ||
    raw.imagePreview ||
    // Campos dentro do metadata retornado pela UazAPI
    metadata.image ||
    metadata.image_preview ||
    metadata.imagePreview ||
    null;

  return {
    id: raw.id,
    user_id: raw.user_id,
    instance_id: raw.instance_id,
    instance_name: raw.instance_name,
    client_id: raw.client_id ?? null,
    external_chat_id: raw.external_chat_id,
    contactName: raw.contact_name ?? null,
    profileName: raw.profile_name ?? null,
    phoneNumber: raw.phone_number ?? null,
    avatarUrl,
    assignedTo: raw.assigned_to ?? null,
    queue: raw.queue ?? null,
    leadId: raw.lead_id ?? null,
    status: raw.status ?? null,
    lastMessagePreview: raw.last_message_preview ?? null,
    lastMessageAt: raw.last_message_at ?? null,
    unreadCount: typeof raw.unread_count === 'number' ? raw.unread_count : 0,
    metadata: metadata ?? null,
    updated_at: raw.updated_at,
  };
};

const normalizeMessage = (raw: any): ChatMessage => ({
  id: raw.id,
  conversation_id: raw.conversation_id,
  direction: raw.direction === 'outgoing' ? 'outgoing' : 'incoming',
  external_message_id: raw.external_message_id ?? null,
  body: raw.body ?? null,
  status: raw.status ?? null,
  sentAt: raw.sent_at ?? raw.created_at ?? null,
  metadata: raw.metadata ?? null,
  created_at: raw.created_at,
});

export const chatService = {
  async listInstances(): Promise<ChatInstance[]> {
    const response = await apiClient.get<ChatInstance[]>('/api/chat/instances');
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || [];
  },

  async createInstance(payload: { name: string; metadata?: Record<string, unknown> }) {
    const response = await apiClient.post<ChatInstance>('/api/chat/instances', payload);
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error('Falha ao criar instância');
    }
    return response.data;
  },

  async connectInstance(id: string, data?: { phone?: string }) {
    const response = await apiClient.post(`/api/chat/instances/${id}/connect`, data || {});
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getInstanceStatus(id: string) {
    const response = await apiClient.get(`/api/chat/instances/${id}/status`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async configureWebhook(id: string, data?: Record<string, unknown>) {
    const response = await apiClient.post(`/api/chat/instances/${id}/webhook`, data || {});
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async syncConversations(instanceId: string, options?: { limit?: number }) {
    const response = await apiClient.post('/api/chat/conversations/sync', {
      instanceId,
      limit: options?.limit,
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getConversations(filters?: {
    instanceId?: string;
    search?: string;
    assignedTo?: string;
    unassigned?: boolean;
    status?: string;
    queue?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.append('instanceId', filters.instanceId);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);
    if (filters?.unassigned) params.append('unassigned', 'true');
    if (filters?.status) params.append('status', filters.status);
    if (filters?.queue) params.append('queue', filters.queue);

    const url = `/api/chat/conversations${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await apiClient.get<ChatConversation[]>(url);
    if (response.error) {
      throw new Error(response.error);
    }
    return (response.data || []).map(normalizeConversation);
  },

  async transferConversation(conversationId: string, payload: { toUserId: string; queue?: string; reason?: string }) {
    const response = await apiClient.post<{ success: boolean; conversation: any }>(
      `/api/chat/conversations/${conversationId}/transfer`,
      payload
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getConversationMessages(conversationId: string) {
    const response = await apiClient.get<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages`);
    if (response.error) {
      throw new Error(response.error);
    }
    return (response.data || []).map(normalizeMessage);
  },

  async syncConversationMessages(conversationId: string, options?: { limit?: number }) {
    const response = await apiClient.post(`/api/chat/conversations/${conversationId}/messages/sync`, {
      limit: options?.limit,
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async sendMessage(conversationId: string, text: string) {
    const response = await apiClient.post(`/api/chat/messages`, {
      conversationId,
      text,
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async markConversationRead(conversationId: string, read = true) {
    const response = await apiClient.post(`/api/chat/conversations/${conversationId}/mark-read`, {
      read,
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async deleteInstance(id: string) {
    const response = await apiClient.delete(`/api/chat/instances/${id}`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },
};



