import { useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';

/**
 * Converte URL do proxy autenticado em object URL (Bearer não pode ir em `<img src>` puro).
 */
export function useChatAvatarProxySrc(src: string | undefined): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() => {
    if (!src) return undefined;
    return src.includes('/api/chat/avatar-proxy') ? undefined : src;
  });

  useEffect(() => {
    if (!src) {
      setResolved(undefined);
      return;
    }
    if (!src.includes('/api/chat/avatar-proxy')) {
      setResolved(src);
      return;
    }

    setResolved(undefined);
    let cancelled = false;
    let objectUrl: string | null = null;
    const endpoint = src.startsWith('http') ? new URL(src).pathname + new URL(src).search : src;

    void (async () => {
      const r = await apiClient.getBlob(endpoint);
      if (cancelled) return;
      if (r.blob && r.blob.size > 0) {
        objectUrl = URL.createObjectURL(r.blob);
        setResolved(objectUrl);
      } else {
        setResolved(undefined);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return resolved;
}
