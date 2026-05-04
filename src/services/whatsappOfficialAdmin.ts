import { apiClient } from '@/integrations/api/client';

const base = '/api/superadmin/whatsapp-official';

export type WhatsappOfficialAccountDto = {
  id: string;
  tenant_id: string | null;
  owner_scope: string;
  business_account_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string;
  is_active: boolean;
  inbox_user_id: string | null;
  app_id: string | null;
  has_app_secret: boolean;
  created_at: string;
  updated_at: string;
  access_token_preview: string;
  encryption_configured: boolean;
};

export const whatsappOfficialAdminService = {
  async getAccount(): Promise<{ account: WhatsappOfficialAccountDto | null; encryption_configured: boolean }> {
    const r = await apiClient.get<{ account: WhatsappOfficialAccountDto | null; encryption_configured: boolean }>(
      `${base}/account`,
    );
    if (r.error) throw new Error(r.error);
    return r.data ?? { account: null, encryption_configured: false };
  },
  async saveAccount(body: {
    business_account_id: string;
    phone_number_id: string;
    access_token: string;
    webhook_verify_token: string;
    app_id?: string | null;
    app_secret?: string | null;
  }): Promise<{
    id: string;
    validation: string;
    graph_error: string | null;
    /** Devolvido quando o servidor gerou o verify token (copiar para o Meta Developer Hub). */
    webhook_verify_token_generated?: string;
  }> {
    const r = await apiClient.put(`${base}/account`, body);
    if (r.error) throw new Error(r.error);
    return r.data as {
      id: string;
      validation: string;
      graph_error: string | null;
      webhook_verify_token_generated?: string;
    };
  },
  /** `access_token` pode ser vazio se já existir conta guardada — o servidor usa o token cifrado. */
  async validate(body: { access_token: string; phone_number_id: string }): Promise<{
    ok: boolean;
    display_phone_number?: string;
    verified_name?: string;
    error?: string;
  }> {
    const r = await apiClient.post(`${base}/validate`, body);
    if (r.error) throw new Error(r.error);
    return r.data as {
      ok: boolean;
      display_phone_number?: string;
      verified_name?: string;
      error?: string;
    };
  },
  async syncTemplates(): Promise<{ upserted: number; templates: unknown[]; meta_received?: number }> {
    const r = await apiClient.post(`${base}/templates/sync`, {});
    if (r.error) {
      const err = new Error(r.error) as Error & { code?: string };
      if (r.code) err.code = r.code;
      throw err;
    }
    return r.data as { upserted: number; templates: unknown[]; meta_received?: number };
  },
  async listTemplates(): Promise<unknown[]> {
    const r = await apiClient.get<unknown[]>(`${base}/templates`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  /** Cria modelo na Meta (aprovação pendente). Requer conta em estado `connected`. */
  async createTemplate(body: {
    name: string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    language: string;
    header_type: 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
    header_text?: string;
    header_media_handle?: string;
    body: string;
    footer?: string;
    buttons: Array<
      | { type: 'QUICK_REPLY'; text: string }
      | { type: 'URL'; text: string; url: string }
      | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
    >;
    variable_examples: Record<string, string>;
  }): Promise<{ id: string; meta_template_id: string | null; status: string | null }> {
    const r = await apiClient.post(`${base}/templates`, body);
    if (r.error) {
      const err = new Error(r.error) as Error & { code?: string };
      if (r.code) err.code = r.code;
      throw err;
    }
    return r.data as { id: string; meta_template_id: string | null; status: string | null };
  },
  async listCampaigns(): Promise<unknown[]> {
    const r = await apiClient.get<unknown[]>(`${base}/campaigns`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  async createCampaign(body: {
    name: string;
    template_name: string;
    language: string;
    audience_type: 'superadmin_lead_group';
    audience_group_id: string;
    template_components?: unknown[];
  }): Promise<{ id: string }> {
    const r = await apiClient.post(`${base}/campaigns`, body);
    if (r.error) throw new Error(r.error);
    return r.data as { id: string };
  },
  async dispatchCampaign(id: string): Promise<{ sent: number; failed: number; error?: string }> {
    const r = await apiClient.post(`${base}/campaigns/${id}/dispatch`, {});
    if (r.error) throw new Error(r.error);
    return r.data as { sent: number; failed: number; error?: string };
  },
  async listConversations(): Promise<
    Array<{
      id: string;
      external_chat_id: string;
      phone_number: string | null;
      last_message_preview: string | null;
      last_message_at: string | null;
      unread_count: number | null;
    }>
  > {
    const r = await apiClient.get(`${base}/conversations`);
    if (r.error) throw new Error(r.error);
    return (r.data ?? []) as Array<{
      id: string;
      external_chat_id: string;
      phone_number: string | null;
      last_message_preview: string | null;
      last_message_at: string | null;
      unread_count: number | null;
    }>;
  },
  async sendText(to_phone: string, text: string): Promise<{ ok: boolean; wamid?: string }> {
    const r = await apiClient.post(`${base}/messages/text`, { to_phone, text });
    if (r.error) throw new Error(r.error);
    return r.data as { ok: boolean; wamid?: string };
  },
};
