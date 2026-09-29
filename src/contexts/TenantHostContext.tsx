import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { publicApiGet } from '@/integrations/api/client';

export type TenantHostPayload = {
  id: string;
  hostname: string;
  role: 'store' | 'support';
  status: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string | null;
  logo_url: string | null;
  store_slug: string | null;
  support_portal_slug: string | null;
  support_portal_enabled: boolean;
};

type TenantHostContextValue = {
  loading: boolean;
  isTenantHost: boolean;
  host: TenantHostPayload | null;
  refresh: () => Promise<void>;
};

const TenantHostContext = createContext<TenantHostContextValue | null>(null);

async function fetchTenantHost(): Promise<TenantHostPayload | null> {
  const host = window.location.hostname;
  const res = await publicApiGet<{
    host: TenantHostPayload | null;
    partner?: boolean;
  }>(`/api/public/tenant-host?domain=${encodeURIComponent(host)}`);
  if (res.error || res.data?.partner || !res.data?.host) return null;
  return res.data.host;
}

export function TenantHostProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState<TenantHostPayload | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const h = await fetchTenantHost();
      setHost(h);
      if (h?.tenant_name) {
        document.title = h.tenant_name;
      }
    } catch {
      setHost(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<TenantHostContextValue>(
    () => ({
      loading,
      isTenantHost: Boolean(host),
      host,
      refresh,
    }),
    [host, loading, refresh]
  );

  return <TenantHostContext.Provider value={value}>{children}</TenantHostContext.Provider>;
}

export function useTenantHost(): TenantHostContextValue {
  const ctx = useContext(TenantHostContext);
  if (!ctx) {
    return {
      loading: false,
      isTenantHost: false,
      host: null,
      refresh: async () => undefined,
    };
  }
  return ctx;
}

/** Paths da vitrine: no host customizado evita prefixo /{slug}/loja. */
export function storefrontHref(
  storeSlug: string | null | undefined,
  suffix: '' | `/produto/${string}` | '/checkout' = '',
  opts?: { customHost?: boolean }
): string {
  const custom = opts?.customHost === true;
  if (custom) {
    if (suffix === '') return '/';
    if (suffix === '/checkout') return '/loja/checkout';
    return `/loja${suffix}`;
  }
  const slug = (storeSlug || '').trim();
  if (!slug) return '/';
  return `/${slug}/loja${suffix}`;
}
