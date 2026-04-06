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
  leadId?: string | null;
  lead_status?: string | null;
  external_chat_id: string;
  contactName?: string | null;
  profileName?: string | null;
  phoneNumber?: string | null;
  /**
   * URL da foto/avatar do contato (derivada do metadata.image / imagePreview da UazAPI)
   */
  avatarUrl?: string | null;
  status?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  link_state?: 'client_linked' | 'lead_linked' | 'review_required' | 'unlinked' | null;
  link_source?: 'auto' | 'manual' | 'system' | null;
  link_confidence?: 'high' | 'review' | 'manual' | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConversationProfile {
  type: 'client' | 'lead' | null;
  profile: any | null;
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
    (typeof metadata.whatsapp_profile_photo === 'string' ? metadata.whatsapp_profile_photo : null) ||
    null;

  return {
  id: raw.id,
  user_id: raw.user_id,
  instance_id: raw.instance_id,
  instance_name: raw.instance_name,
  client_id: raw.client_id ?? null,
    leadId: raw.lead_id ?? null,
    lead_status: raw.lead_status ?? null,
  external_chat_id: raw.external_chat_id,
  contactName: raw.contact_name ?? null,
  profileName: raw.profile_name ?? null,
  phoneNumber: raw.phone_number ?? null,
    avatarUrl,
  status: raw.status ?? null,
  lastMessagePreview: raw.last_message_preview ?? null,
  lastMessageAt: raw.last_message_at ?? null,
  unreadCount: typeof raw.unread_count === 'number' ? raw.unread_count : 0,
    link_state: raw.link_state ?? metadata.link_state ?? null,
    link_source: raw.link_source ?? metadata.link_source ?? null,
    link_confidence: raw.link_confidence ?? metadata.link_confidence ?? null,
    metadata: metadata ?? null,
  created_at: raw.created_at,
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

  async getConversations(filters?: { instanceId?: string; search?: string; startDate?: string; endDate?: string }) {
    const params = new URLSearchParams();
    if (filters?.instanceId) params.append('instanceId', filters.instanceId);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);

    const url = `/api/chat/conversations${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await apiClient.get<ChatConversation[]>(url);
    if (response.error) {
      throw new Error(response.error);
    }
    return (response.data || []).map(normalizeConversation);
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

  /** Busca na UazAPI o chat por wa_chatid e reaplica upsert (nome, foto, metadata). Não sincroniza mensagens. */
  async refreshConversationIdentity(conversationId: string): Promise<{
    ok: boolean;
    updated: boolean;
    reason?: string;
    conversation?: ChatConversation;
  }> {
    const response = await apiClient.post<{
      ok: boolean;
      updated: boolean;
      reason?: string;
      conversation?: Record<string, unknown>;
    }>(`/api/chat/conversations/${conversationId}/refresh-identity`);
    if (response.error) {
      throw new Error(response.error);
    }
    const data = response.data;
    if (!data) {
      throw new Error('Resposta vazia ao atualizar contato');
    }
    return {
      ...data,
      conversation: data.conversation ? normalizeConversation(data.conversation) : undefined,
    };
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

  async linkConversation(
    conversationId: string,
    payload: { type: 'client' | 'lead'; id: string }
  ): Promise<ChatConversation> {
    const response = await apiClient.post<ChatConversation>(
      `/api/chat/conversations/${conversationId}/link`,
      payload
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Falha ao vincular conversa');
    return normalizeConversation(response.data);
  },

  async unlinkConversation(conversationId: string): Promise<ChatConversation> {
    const response = await apiClient.delete<ChatConversation>(`/api/chat/conversations/${conversationId}/link`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Falha ao remover vínculo');
    return normalizeConversation(response.data);
  },

  async deleteInstance(id: string) {
    const response = await apiClient.delete(`/api/chat/instances/${id}`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getConversationProfile(conversationId: string): Promise<ConversationProfile> {
    const response = await apiClient.get<ConversationProfile>(`/api/chat/conversations/${conversationId}/profile`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || { type: null, profile: null };
  },

  async getClientMessages(clientId: string): Promise<{ messages: ChatMessage[]; conversationId: string | null; conversationIds: string[] }> {
    const response = await apiClient.get<{ messages: ChatMessage[]; conversationId: string | null; conversationIds: string[] }>(`/api/chat/clients/${clientId}/messages`);
    if (response.error) {
      throw new Error(response.error);
    }
    const data = response.data || { messages: [], conversationId: null, conversationIds: [] };
    return {
      messages: (data.messages || []).map(normalizeMessage),
      conversationId: data.conversationId || null,
      conversationIds: data.conversationIds || [],
    };
  },

  /** Foto WhatsApp da conversa vinculada (metadata); não persiste no CRM. */
  async getCrmWhatsappIdentity(params: { clientId?: string; leadId?: string }): Promise<{ avatarUrl: string | null }> {
    const q = new URLSearchParams();
    if (params.clientId) q.set('clientId', params.clientId);
    if (params.leadId) q.set('leadId', params.leadId);
    const response = await apiClient.get<{ avatarUrl: string | null }>(`/api/chat/crm-whatsapp-identity?${q.toString()}`);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data || { avatarUrl: null };
  },
};



