import { apiClient } from '@/integrations/api/client';

export interface SendMessageParams {
  templateId?: string;
  resourceType?: string;
  action?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: 'email' | 'whatsapp' | 'both';
  subject?: string;
  body?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SendMessageResponse {
  success: boolean;
  messageLogId?: string;
  conversationId?: string;
  message?: string;
  error?: string;
}

export const messagesService = {
  async send(params: SendMessageParams): Promise<SendMessageResponse> {
    const response = await apiClient.post<SendMessageResponse>('/api/messages/send', params);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  },
};


