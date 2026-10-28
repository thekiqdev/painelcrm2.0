import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { LEADS_UNSEEN_REFRESH_EVENT } from '@/lib/leadUnseenEvents';

export function useLeadUnseenCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    const response = await apiClient.get<{ count: number }>('/api/leads/unseen-count');
    if (response.error) {
      setCount(0);
      return;
    }
    setCount(Math.max(0, Number(response.data?.count ?? 0)));
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener(LEADS_UNSEEN_REFRESH_EVENT, onRefresh);
    window.addEventListener('focus', onRefresh);
    const timer = window.setInterval(onRefresh, 30_000);
    return () => {
      window.removeEventListener(LEADS_UNSEEN_REFRESH_EVENT, onRefresh);
      window.removeEventListener('focus', onRefresh);
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);

  return count;
}

export function formatUnseenCount(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return '99+';
  return String(count);
}
