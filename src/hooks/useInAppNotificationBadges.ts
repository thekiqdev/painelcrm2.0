import { useCallback, useEffect, useState } from 'react';
import { announcementsUpdatesService } from '@/services/announcementsUpdates';
import { systemNotificationsService, UPDATES_REFRESH_EVENT } from '@/services/systemNotifications';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';

export function useInAppNotificationBadges() {
  const [notifUnread, setNotifUnread] = useState(0);
  const [updatesUnread, setUpdatesUnread] = useState(0);

  const refresh = useCallback(async () => {
    const [n, u] = await Promise.all([
      systemNotificationsService.unreadCount('system'),
      announcementsUpdatesService.unreadCount(),
    ]);
    setNotifUnread(n);
    setUpdatesUnread(u);
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 45_000);
    const onEvt = () => void refresh();
    const onRealtimeNotification = () => void refresh();
    window.addEventListener(UPDATES_REFRESH_EVENT, onEvt);
    window.addEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRealtimeNotification);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(UPDATES_REFRESH_EVENT, onEvt);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRealtimeNotification);
    };
  }, [refresh]);

  return { notifUnread, updatesUnread, refresh };
}
