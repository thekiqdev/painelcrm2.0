import { apiClient } from '@/integrations/api/client';
import { getActiveChatCacheSession } from '@/lib/queryClient';
import { notificationsUnreadCache } from '@/services/shellPollHttpCaches';

/** Alinhado a `NotificationListItemDto` do backend. */
export type InboxNotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  href: string;
  category: 'system' | 'message';
  read: boolean;
  read_at: string | null;
  created_at: string;
  /** Metadados sanitizados (chat, SLA, etc.) — opcional em notificações antigas. */
  data?: Record<string, unknown>;
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
  async list(limit = 25, category?: 'system' | 'message'): Promise<InboxNotificationRow[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (category) params.set('category', category);
    const r = await apiClient.get<{ notifications: InboxNotificationRow[] }>(`/api/notifications?${params.toString()}`);
    if (r.error) throw new Error(r.error);
    return r.data?.notifications ?? [];
  },

  async unreadCount(
    category?: 'system' | 'message',
    options?: { force?: boolean },
  ): Promise<number> {
    const scope = getActiveChatCacheSession();
    const keyBase = scope ? `${scope.tenantId}:${scope.userId}` : '__session__';
    const cacheKey = `${keyBase}:notif-unread:${category ?? 'all'}`;
    return notificationsUnreadCache.get(
      cacheKey,
      async () => {
        const suffix = category ? `?category=${category}` : '';
        const r = await apiClient.get<{ count: number }>(`/api/notifications/unread-count${suffix}`);
        if (r.error) return 0;
        return r.data?.count ?? 0;
      },
      options,
    );
  },

  async markRead(id: string): Promise<void> {
    const r = await apiClient.post(`/api/notifications/${id}/read`, {});
    if (r.error) throw new Error(r.error);
    notificationsUnreadCache.invalidate();
  },

  async markAllRead(category?: 'system' | 'message'): Promise<void> {
    const suffix = category ? `?category=${category}` : '';
    const r = await apiClient.patch(`/api/notifications/read-all${suffix}`, {});
    if (r.error) throw new Error(r.error);
    notificationsUnreadCache.invalidate();
  },

  /** Apaga todas as notificações do utilizador atual. */
  async clearAll(): Promise<void> {
    const r = await apiClient.delete<{ deleted?: number }>('/api/notifications');
    if (r.error) throw new Error(r.error);
    notificationsUnreadCache.invalidate();
  },
};
