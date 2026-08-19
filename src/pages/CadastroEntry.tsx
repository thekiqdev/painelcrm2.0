/**
 * `/cadastro` — Platform exclusive signup OU checkout Partner em domínio WL.
 */
import { Suspense } from 'react';
import { usePartnerBrand } from '@/contexts/PartnerBrandContext';
import { lazyWithReload } from '@/lib/lazyWithReload';
import { RouteLoadingFallback } from '@/components/RouteLoadingFallback';
import { Loader2 } from 'lucide-react';

const AcquisitionSignupFlow = lazyWithReload(() => import('@/pages/AcquisitionSignupFlow'));
const PartnerChannelCheckout = lazyWithReload(() => import('@/pages/partner/PartnerChannelCheckout'));

export default function CadastroEntry() {
  const { loading, isPartnerHost } = usePartnerBrand();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isPartnerHost) {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <PartnerChannelCheckout />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <AcquisitionSignupFlow />
    </Suspense>
  );
}
