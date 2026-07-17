import { useCallback, useEffect, useRef, useState } from 'react';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { ticketsService } from '@/services/tickets';

const EVENT_DEBOUNCE_MS = 400;

export function useTicketMenuCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  const debounceRef = useRef<number | null>(null);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      setCount(await ticketsService.getMenuCount(options));
    } catch {
      setCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void refresh({ force: true });
      }, EVENT_DEBOUNCE_MS);
    };
    window.addEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRefresh);
    const t = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.removeEventListener(REALTIME_WINDOW_EVENTS.notificationCreated, onRefresh);
      window.clearInterval(t);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [enabled, refresh]);

  return count;
}
