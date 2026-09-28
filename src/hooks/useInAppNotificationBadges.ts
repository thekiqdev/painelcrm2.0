import { useCallback, useEffect, useRef, useState } from 'react';
import { announcementsUpdatesService } from '@/services/announcementsUpdates';
import { systemNotificationsService, UPDATES_REFRESH_EVENT } from '@/services/systemNotifications';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';

const EVENT_DEBOUNCE_MS = 400;

export function useInAppNotificationBadges() {
  const [notifUnread, setNotifUnread] = useState(0);
  const [updatesUnread, setUpdatesUnread] = useState(0);
  const debounceRef = useRef<number | null>(null);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const [n, u] = await Promise.all([
      systemNotificationsService.unreadCount('system', options),
      announcementsUpdatesService.unreadCount(),
    ]);
    setNotifUnread(n);
    setUpdatesUnread(u);
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 45_000);
    const onEvt = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void refresh({ force: true });
      }, EVENT_DEBOUNCE_MS);
    };
    window.addEventListener(UPDATES_REFRESH_EVENT, onEvt);
    window.addEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onEvt);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(UPDATES_REFRESH_EVENT, onEvt);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onEvt);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  return { notifUnread, updatesUnread, refresh };
}
