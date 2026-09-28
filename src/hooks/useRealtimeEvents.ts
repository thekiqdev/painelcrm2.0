import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  connectRealtime,
  disconnectRealtime,
  REALTIME_EVENTS,
} from '@/services/realtimeClient';
import { emitInAppNotificationsRefresh } from '@/services/systemNotifications';
import { resetWhatsAppIntegrationCaches } from '@/lib/whatsappInstanceCacheReset';

export function useRealtimeEvents(): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session?.token) {
      disconnectRealtime();
      return;
    }

    const socket = connectRealtime(session.token);
    const onNotificationCreated = () => {
      emitInAppNotificationsRefresh();
    };
    const onWhatsappInstanceRemoved = () => {
      resetWhatsAppIntegrationCaches(queryClient);
    };
    socket.on('notification.created', onNotificationCreated);
    socket.on(REALTIME_EVENTS.whatsappInstanceRemoved, onWhatsappInstanceRemoved);

    return () => {
      socket.off('notification.created', onNotificationCreated);
      socket.off(REALTIME_EVENTS.whatsappInstanceRemoved, onWhatsappInstanceRemoved);
    };
  }, [session?.token, queryClient]);
}

