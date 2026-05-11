import { useCallback, useEffect, useState } from 'react';
import {
  superadminPlatformSupportService,
  type SuperadminPlatformSupportSummary,
} from '@/services/platformSupport';

const SUMMARY_POLL_MS = 60_000;

export function useSuperadminPlatformSupportSummary(enabled = true) {
  const [summary, setSummary] = useState<SuperadminPlatformSupportSummary | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await superadminPlatformSupportService.getSummary();
      setSummary(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar resumo de suporte');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, SUMMARY_POLL_MS);

    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  const pendingCount = (summary?.open ?? 0) + (summary?.waiting_support ?? 0);

  return { summary, loading, error, refresh, pendingCount };
}
