import { useCallback, useEffect, useState } from 'react';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { ticketsService } from '@/services/tickets';

export function useTicketMenuCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      setCount(await ticketsService.getMenuCount());
    } catch {
      setCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => void refresh();
    window.addEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRefresh);
    const t = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.removeEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRefresh);
      window.clearInterval(t);
    };
  }, [enabled, refresh]);

  return count;
}
