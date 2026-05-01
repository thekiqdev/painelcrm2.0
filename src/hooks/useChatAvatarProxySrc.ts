import { useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';

/** Chave estável: path + query (ignora origem). */
function cacheKeyFromProxySrc(src: string): string {
  try {
    if (src.startsWith('http')) {
      const u = new URL(src);
      return `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return src;
}

/**
 * Evita dezenas de GET 502 na lista do chat: mesma URL = um fetch; falha 5xx/403/404 = não repetir na sessão.
 * 401/429 não entram no cache (token / rate limit podem recuperar).
 */
const failedProxyKeys = new Set<string>();
const PROXY_FAIL_CACHE_MAX = 500;
const inflight = new Map<string, Promise<{ blob?: Blob; error?: string; status?: number }>>();

function rememberFailure(key: string) {
  if (failedProxyKeys.size >= PROXY_FAIL_CACHE_MAX) {
    const it = failedProxyKeys.values().next();
    if (!it.done) failedProxyKeys.delete(it.value);
  }
  failedProxyKeys.add(key);
}

/** Não cachear 401/429; todo o resto (502, 403, rede, etc.) evita re-spam no console. */
function shouldRememberFailure(r: { status?: number }): boolean {
  return r.status !== 401 && r.status !== 429;
}

async function getBlobDeduped(endpoint: string, key: string) {
  let p = inflight.get(key);
  if (!p) {
    p = apiClient.getBlob(endpoint);
    inflight.set(key, p);
    void p.finally(() => {
      inflight.delete(key);
    });
  }
  return p;
}

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

    const key = cacheKeyFromProxySrc(src);
    if (failedProxyKeys.has(key)) {
      setResolved(undefined);
      return;
    }

    setResolved(undefined);
    let cancelled = false;
    let objectUrl: string | null = null;
    const endpoint = src.startsWith('http') ? new URL(src).pathname + new URL(src).search : src;

    void (async () => {
      const r = await getBlobDeduped(endpoint, key);
      if (cancelled) return;

      const ok = r.blob != null && r.blob.size > 0;
      if (!ok && shouldRememberFailure(r)) {
        rememberFailure(key);
      }

      if (ok) {
        objectUrl = URL.createObjectURL(r.blob!);
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
