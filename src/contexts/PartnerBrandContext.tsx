import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { publicApiGet } from '@/integrations/api/client';

export type PartnerBrand = {
  partner_tenant_id: string;
  public_name: string;
  product_name: string;
  logo_url: string | null;
  theme_json: Record<string, unknown>;
  tagline: string | null;
  custom_domain: string | null;
  domain_status: string;
  slug?: string | null;
};

type PartnerBrandContextValue = {
  loading: boolean;
  isPartnerHost: boolean;
  brand: PartnerBrand | null;
  /** Nome do produto a exibir (Partner ou Platform). */
  displayName: string;
  tagline: string;
  logoUrl: string | null;
  refresh: () => Promise<void>;
};

const DEFAULT_PLATFORM_NAME =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_APP_PUBLIC_NAME?: string } }).env
      ?.VITE_APP_PUBLIC_NAME) ||
  'PainelCRM';

const DEFAULT_TAGLINE =
  'CRM completo para vendas, atendimento e relacionamento — num só lugar.';

const PartnerBrandContext = createContext<PartnerBrandContextValue | null>(null);

function applyTheme(theme: Record<string, unknown> | null | undefined) {
  const root = document.documentElement;
  if (!theme) {
    root.style.removeProperty('--partner-primary');
    root.style.removeProperty('--partner-accent');
    return;
  }
  if (typeof theme.primary === 'string' && theme.primary.trim()) {
    root.style.setProperty('--partner-primary', theme.primary.trim());
  }
  if (typeof theme.accent === 'string' && theme.accent.trim()) {
    root.style.setProperty('--partner-accent', theme.accent.trim());
  }
}

async function fetchBrandForHost(): Promise<PartnerBrand | null> {
  const host = window.location.hostname;
  const res = await publicApiGet<{ brand: PartnerBrand | null; platform?: boolean }>(
    `/api/public/partner-brand?domain=${encodeURIComponent(host)}`,
  );
  if (res.error || !res.data?.brand) return null;
  return res.data.brand;
}

export function PartnerBrandProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState<PartnerBrand | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const b = await fetchBrandForHost();
      setBrand(b);
      applyTheme(b?.theme_json);
      const name = b?.product_name || b?.public_name || DEFAULT_PLATFORM_NAME;
      document.title = name;
    } catch {
      setBrand(null);
      applyTheme(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<PartnerBrandContextValue>(() => {
    const displayName = brand?.product_name || brand?.public_name || DEFAULT_PLATFORM_NAME;
    const tagline =
      (typeof brand?.theme_json?.tagline === 'string' && brand.theme_json.tagline.trim()) ||
      brand?.tagline ||
      DEFAULT_TAGLINE;
    return {
      loading,
      isPartnerHost: Boolean(brand),
      brand,
      displayName,
      tagline,
      logoUrl: brand?.logo_url ?? null,
      refresh,
    };
  }, [brand, loading, refresh]);

  return (
    <PartnerBrandContext.Provider value={value}>{children}</PartnerBrandContext.Provider>
  );
}

export function usePartnerBrand(): PartnerBrandContextValue {
  const ctx = useContext(PartnerBrandContext);
  if (!ctx) {
    return {
      loading: false,
      isPartnerHost: false,
      brand: null,
      displayName: DEFAULT_PLATFORM_NAME,
      tagline: DEFAULT_TAGLINE,
      logoUrl: null,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
