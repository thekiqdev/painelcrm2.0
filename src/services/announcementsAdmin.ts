import { apiClient } from '@/integrations/api/client';

const base = '/api/superadmin/announcements';

export type AnnouncementType = 'whatsapp_only' | 'whatsapp_and_updates_page';
export type AnnouncementCategory = 'novidade' | 'melhoria' | 'correcao' | 'aviso';
export type AnnouncementStatus = 'draft' | 'published' | 'unpublished';

export type AnnouncementRow = {
  id: string;
  title: string;
  type: AnnouncementType;
  status: AnnouncementStatus;
  category: AnnouncementCategory | null;
  featured: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  visibility_group_id: string | null;
};

export type AnnouncementDetail = AnnouncementRow & {
  whatsapp_message: string;
  page_summary: string | null;
  page_content: string | null;
  banner_url: string | null;
  version: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type AnnouncementGroup = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count: number;
};

export type AnnouncementSendListRow = {
  id: string;
  announcement_id: string;
  group_id: string | null;
  superadmin_lead_group_id?: string | null;
  status: string;
  delay_seconds: number;
  scheduled_start_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  announcement_title: string;
  group_name: string;
  /** tenant_group = empresas SaaS; lead_group = contactos importados no Super Admin */
  audience?: 'tenant_group' | 'lead_group';
};

export const announcementsAdminService = {
  async list(): Promise<AnnouncementRow[]> {
    const r = await apiClient.get<AnnouncementRow[]>(base);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  async get(id: string): Promise<AnnouncementDetail> {
    const r = await apiClient.get<AnnouncementDetail>(`${base}/${id}`);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Anúncio não encontrado');
    return r.data;
  },
  async create(body: Record<string, unknown>): Promise<{ id: string }> {
    const r = await apiClient.post<{ id: string }>(base, body);
    if (r.error) throw new Error(r.error);
    if (!r.data?.id) throw new Error('Resposta inválida');
    return r.data;
  },
  async patch(id: string, body: Record<string, unknown>): Promise<void> {
    const r = await apiClient.patch<{ ok: boolean }>(`${base}/${id}`, body);
    if (r.error) throw new Error(r.error);
  },
  async publish(id: string): Promise<void> {
    const r = await apiClient.post<{ ok: boolean }>(`${base}/${id}/publish`, {});
    if (r.error) throw new Error(r.error);
  },
  async unpublish(id: string): Promise<void> {
    const r = await apiClient.post<{ ok: boolean }>(`${base}/${id}/unpublish`, {});
    if (r.error) throw new Error(r.error);
  },
  async remove(id: string): Promise<void> {
    const r = await apiClient.delete(`${base}/${id}`);
    if (r.error) throw new Error(r.error);
  },
  async send(
    id: string,
    body: {
      group_id?: string;
      superadmin_lead_group_id?: string;
      delay_seconds?: number;
      scheduled_start_at?: string | null;
    },
  ): Promise<{ send_id: string }> {
    const r = await apiClient.post<{ send_id: string; recipients: number }>(`${base}/${id}/send`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data?.send_id) throw new Error('Resposta inválida');
    return { send_id: r.data.send_id };
  },
  async listSends(): Promise<AnnouncementSendListRow[]> {
    const r = await apiClient.get<AnnouncementSendListRow[]>(`${base}/sends`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  async getSend(sendId: string): Promise<{
    send: AnnouncementSendListRow;
    recipients: Array<{
      id: string;
      tenant_id: string | null;
      superadmin_lead_id: string | null;
      lead_name: string | null;
      phone: string | null;
      status: string;
      attempt_count: number;
      error_message: string | null;
      scheduled_at: string;
      sent_at: string | null;
    }>;
  }> {
    const r = await apiClient.get(`${base}/sends/${sendId}`);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Não encontrado');
    return r.data as {
      send: AnnouncementSendListRow;
      recipients: Array<{
        id: string;
        tenant_id: string | null;
        superadmin_lead_id: string | null;
        lead_name: string | null;
        phone: string | null;
        status: string;
        attempt_count: number;
        error_message: string | null;
        scheduled_at: string;
        sent_at: string | null;
      }>;
    };
  },
  async listGroups(): Promise<AnnouncementGroup[]> {
    const r = await apiClient.get<AnnouncementGroup[]>(`${base}/groups`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  async createGroup(body: { name: string; description?: string | null; is_active?: boolean }): Promise<{ id: string }> {
    const r = await apiClient.post<{ id: string }>(`${base}/groups`, body);
    if (r.error) throw new Error(r.error);
    if (!r.data?.id) throw new Error('Resposta inválida');
    return r.data;
  },
  async patchGroup(id: string, body: Partial<{ name: string; description: string | null; is_active: boolean }>): Promise<void> {
    const r = await apiClient.patch(`${base}/groups/${id}`, body);
    if (r.error) throw new Error(r.error);
  },
  async getGroupMembers(id: string): Promise<{ tenant_ids: string[] }> {
    const r = await apiClient.get<{ tenant_ids: string[] }>(`${base}/groups/${id}/members`);
    if (r.error) throw new Error(r.error);
    return r.data ?? { tenant_ids: [] };
  },
  async putGroupMembers(id: string, tenant_ids: string[]): Promise<void> {
    const r = await apiClient.put(`${base}/groups/${id}/members`, { tenant_ids });
    if (r.error) throw new Error(r.error);
  },
};
