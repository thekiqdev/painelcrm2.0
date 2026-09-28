import { apiClient } from '@/integrations/api/client';

export type UpdateListItem = {
  id: string;
  title: string;
  type: string;
  page_summary: string | null;
  category: string | null;
  banner_url: string | null;
  featured: boolean;
  version: string | null;
  published_at: string;
  created_at: string;
  /** Só listagem; super admin vê sempre como lidas. */
  read?: boolean;
};

export type UpdateDetail = UpdateListItem & {
  page_content: string | null;
};

export const announcementsUpdatesService = {
  async list(category?: string): Promise<UpdateListItem[]> {
    const q = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
    const r = await apiClient.get<UpdateListItem[]>(`/api/announcements/updates${q}`);
    if (r.error) throw new Error(r.error);
    return r.data ?? [];
  },
  async get(id: string): Promise<UpdateDetail> {
    const r = await apiClient.get<UpdateDetail>(`/api/announcements/updates/${id}`);
    if (r.error) throw new Error(r.error);
    if (!r.data) throw new Error('Não encontrado');
    return r.data;
  },

  async unreadCount(): Promise<number> {
    const r = await apiClient.get<{ count: number }>('/api/announcements/updates/unread-count');
    if (r.error) return 0;
    return r.data?.count ?? 0;
  },

  /** Sem IDs = marcar todas as atualizações visíveis como lidas. */
  async markRead(announcementIds?: string[]): Promise<number> {
    const r = await apiClient.post<{ marked: number }>('/api/announcements/updates/mark-read', {
      announcement_ids: announcementIds?.length ? announcementIds : undefined,
    });
    if (r.error) throw new Error(r.error);
    return r.data?.marked ?? 0;
  },
};
