import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface TenantDetailData {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  plan_id: string;
  plan_name?: string;
  plan_slug?: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
  users_count?: number;
  timezone?: string | null;
  locale?: string | null;
  logo_url?: string | null;
}

interface TenantDetailContextValue {
  tenant: TenantDetailData | null;
  setTenant: (t: TenantDetailData | null) => void;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  tenantId: string | null;
}

const TenantDetailContext = createContext<TenantDetailContextValue | null>(null);

export function useTenantDetail() {
  const ctx = useContext(TenantDetailContext);
  if (!ctx) throw new Error('useTenantDetail must be used within TenantDetailProvider');
  return ctx;
}

interface TenantDetailProviderProps {
  tenantId: string | null;
  children: ReactNode;
}

export function TenantDetailProvider({ tenantId, children }: TenantDetailProviderProps) {
  const [tenant, setTenant] = useState<TenantDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(false);
    try {
      const { apiClient } = await import('@/integrations/api/client');
      const res = await apiClient.get<TenantDetailData>(`/api/superadmin/tenants/${tenantId}`);
      if (res.data) setTenant(res.data);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    if (!tenantId) {
      setTenant(null);
      setLoading(false);
      setError(false);
      return;
    }
    refresh();
  }, [tenantId, refresh]);

  const value: TenantDetailContextValue = {
    tenant,
    setTenant,
    loading,
    error,
    refresh,
    tenantId,
  };

  return (
    <TenantDetailContext.Provider value={value}>
      {children}
    </TenantDetailContext.Provider>
  );
}
