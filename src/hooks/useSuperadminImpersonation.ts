import { useCallback, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';

type ImpersonationResponse = {
  token: string;
  url: string;
};

type PrimaryTenantUserResponse = {
  id: string;
};

export function buildSuperadminImpersonationUrl(
  baseUrl: string | null | undefined,
  token: string,
  targetPath = '/dashboard',
): string {
  const base = baseUrl?.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
  const url = new URL(targetPath, base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('impersonation_token', token);
  return url.toString();
}

export function useSuperadminImpersonation() {
  const [impersonating, setImpersonating] = useState(false);
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null);
  const [impersonatingTenantId, setImpersonatingTenantId] = useState<string | null>(null);

  const openAsUser = useCallback(async (userId: string) => {
    setImpersonating(true);
    setImpersonatingUserId(userId);
    try {
      const res = await apiClient.post<ImpersonationResponse>('/api/superadmin/impersonate', {
        user_id: userId,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (!res.data?.token) {
        toast.error('Resposta inválida do servidor.');
        return;
      }

      const targetUrl = buildSuperadminImpersonationUrl(res.data.url, res.data.token);
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      toast.success('Abrindo o sistema como esse usuário em nova aba.');
    } finally {
      setImpersonating(false);
      setImpersonatingUserId(null);
    }
  }, []);

  const openAsTenantPrimaryUser = useCallback(
    async (tenantId: string) => {
      setImpersonatingTenantId(tenantId);
      try {
        const primary = await apiClient.get<PrimaryTenantUserResponse>(
          `/api/superadmin/tenants/${tenantId}/primary-user`,
        );
        if (primary.error) {
          toast.error(primary.error);
          return;
        }
        if (!primary.data?.id) {
          toast.error('Nenhum usuário principal encontrado para esta empresa.');
          return;
        }
        await openAsUser(primary.data.id);
      } finally {
        setImpersonatingTenantId(null);
      }
    },
    [openAsUser],
  );

  return {
    impersonating,
    impersonatingUserId,
    impersonatingTenantId,
    openAsUser,
    openAsTenantPrimaryUser,
  };
}
