import { useCallback, useEffect, useState } from 'react';
import { announcementsUpdatesService } from '@/services/announcementsUpdates';
import { systemNotificationsService, UPDATES_REFRESH_EVENT } from '@/services/systemNotifications';

export function useInAppNotificationBadges() {
  const [notifUnread, setNotifUnread] = useState(0);
  const [updatesUnread, setUpdatesUnread] = useState(0);

  const refresh = useCallback(async () => {
    const [n, u] = await Promise.all([
      systemNotificationsService.unreadCount(),
      announcementsUpdatesService.unreadCount(),
    ]);
    setNotifUnread(n);
    setUpdatesUnread(u);
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 45_000);
    const onEvt = () => void refresh();
    window.addEventListener(UPDATES_REFRESH_EVENT, onEvt);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(UPDATES_REFRESH_EVENT, onEvt);
    };
  }, [refresh]);

  return { notifUnread, updatesUnread, refresh };
}
