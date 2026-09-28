import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { isValidOperationalSlug } from '@/lib/operationalSlug';

export type SlugCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; suggestion: string }
  | { status: 'invalid' };

export function useOperationalSlugCheck(slug: string) {
  const [check, setCheck] = useState<SlugCheckState>({ status: 'idle' });
  const reqId = useRef(0);

  const runCheck = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setCheck({ status: 'idle' });
      return;
    }
    if (!isValidOperationalSlug(trimmed)) {
      setCheck({ status: 'invalid' });
      return;
    }
    const id = ++reqId.current;
    setCheck({ status: 'checking' });
    const res = await apiClient.get<{ available: boolean; suggestion?: string }>(
      `/api/public/acquisition/slug/check?slug=${encodeURIComponent(trimmed)}`,
    );
    if (id !== reqId.current) return;
    if (res.error || !res.data) {
      setCheck({ status: 'idle' });
      return;
    }
    if (res.data.available) {
      setCheck({ status: 'available' });
      return;
    }
    setCheck({
      status: 'unavailable',
      suggestion: res.data.suggestion ?? `${trimmed}-2`,
    });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void runCheck(slug), 400);
    return () => window.clearTimeout(t);
  }, [slug, runCheck]);

  return check;
}
