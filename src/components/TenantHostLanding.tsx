/**
 * TD Sprint 2 — raiz `/` em host customizado do tenant (loja | portal de chamados).
 */
import { Suspense, lazy } from 'react';
import { useTenantHost } from '@/contexts/TenantHostContext';
import { PublicSupportNotFound } from '@/components/public-support/PublicSupportNotFound';

const PublicStore = lazy(() =>
  import('@/pages/PublicStore').then((m) => ({ default: m.PublicStore }))
);
const PublicTenantSupportPortalPage = lazy(
  () => import('@/pages/PublicTenantSupportPortalPage')
);

const LoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-crm-primary border-t-transparent" />
  </div>
);

export default function TenantHostLanding() {
  const { loading, host } = useTenantHost();

  if (loading) return <LoadingFallback />;
  if (!host) return <LoadingFallback />;

  if (host.role === 'store') {
    if (!host.store_slug) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
          <h1 className="text-xl font-semibold">Loja indisponível</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Este domínio está configurado para a loja, mas ainda não há vitrine ativa neste tenant.
          </p>
        </div>
      );
    }
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PublicStore />
      </Suspense>
    );
  }

  if (host.role === 'support') {
    if (!host.support_portal_enabled || !host.support_portal_slug) {
      return <PublicSupportNotFound variant="portal" />;
    }
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PublicTenantSupportPortalPage />
      </Suspense>
    );
  }

  return <LoadingFallback />;
}
