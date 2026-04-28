import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { connectRealtime, disconnectRealtime } from '@/services/realtimeClient';
import { emitInAppNotificationsRefresh } from '@/services/systemNotifications';

export function useRealtimeEvents(): void {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.token) {
      disconnectRealtime();
      return;
    }

    const socket = connectRealtime(session.token);
    const onNotificationCreated = () => {
      emitInAppNotificationsRefresh();
    };
    socket.on('notification.created', onNotificationCreated);

    return () => {
      socket.off('notification.created', onNotificationCreated);
    };
  }, [session?.token]);
}

