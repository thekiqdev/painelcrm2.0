import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getMyTenantCompany, type TenantCompanyPayload } from '@/services/tenantCompany';
import { resolveTenantLogoUrl } from '@/utils/tenantBranding';
import { useTheme } from 'next-themes';

type TenantBrandContextValue = {
  company: TenantCompanyPayload | null;
  loading: boolean;
  error: string | null;
  /** URL já resolvida para o tema atual */
  resolvedLogoUrl: string | null;
  refresh: () => Promise<void>;
};

const TenantBrandContext = createContext<TenantBrandContextValue | undefined>(undefined);

export function TenantBrandProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [company, setCompany] = useState<TenantCompanyPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.tenant_id || user.is_super_admin) {
      setCompany(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getMyTenantCompany();
      if (res.error) {
        setError(res.error);
        setCompany(null);
        return;
      }
      setCompany(res.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar marca');
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, [user?.tenant_id, user?.is_super_admin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolvedLogoUrl = useMemo(
    () => resolveTenantLogoUrl(resolvedTheme, company),
    [resolvedTheme, company]
  );

  const value = useMemo(
    () => ({
      company,
      loading,
      error,
      resolvedLogoUrl,
      refresh,
    }),
    [company, loading, error, resolvedLogoUrl, refresh]
  );

  return <TenantBrandContext.Provider value={value}>{children}</TenantBrandContext.Provider>;
}

export function useTenantBrand(): TenantBrandContextValue {
  const ctx = useContext(TenantBrandContext);
  if (!ctx) {
    throw new Error('useTenantBrand must be used within TenantBrandProvider');
  }
  return ctx;
}
