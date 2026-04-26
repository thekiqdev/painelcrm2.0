import { apiClient } from '@/integrations/api/client';

/** Alinhado a `NotificationListItemDto` do backend. */
export type InboxNotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  href: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
};

export const UPDATES_REFRESH_EVENT = 'painelcrm:notifications-refresh';

export function emitInAppNotificationsRefresh(): void {
  window.dispatchEvent(new Event(UPDATES_REFRESH_EVENT));
}

export function resolveNotificationHref(n: InboxNotificationRow): string {
  if (n.href?.startsWith('/')) return n.href;
  return '/dashboard';
}

export const systemNotificationsService = {
  async list(limit = 25): Promise<InboxNotificationRow[]> {
    const r = await apiClient.get<{ notifications: InboxNotificationRow[] }>(`/api/notifications?limit=${limit}`);
    if (r.error) throw new Error(r.error);
    return r.data?.notifications ?? [];
  },

  async unreadCount(): Promise<number> {
    const r = await apiClient.get<{ count: number }>('/api/notifications/unread-count');
    if (r.error) return 0;
    return r.data?.count ?? 0;
  },

  async markRead(id: string): Promise<void> {
    const r = await apiClient.post(`/api/notifications/${id}/read`, {});
    if (r.error) throw new Error(r.error);
  },

  async markAllRead(): Promise<void> {
    const r = await apiClient.patch('/api/notifications/read-all', {});
    if (r.error) throw new Error(r.error);
  },

  /** Apaga todas as notificações do utilizador atual. */
  async clearAll(): Promise<void> {
    const r = await apiClient.delete<{ deleted?: number }>('/api/notifications');
    if (r.error) throw new Error(r.error);
  },
};
