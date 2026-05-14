import { Suspense } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { useParams } from "react-router-dom";
import AuthGuard from "@/components/AuthGuard";
import AppLayout from "@/layouts/AppLayout.lazy";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";
import { isPlatformSupportTicketPathSegment } from "@/lib/supportPortalRouting";

const PlatformSupportTicketDetail = lazyWithReload(() => import("@/pages/PlatformSupportTicketDetail"));
const PublicTenantSupportPortalPage = lazyWithReload(() => import("@/pages/PublicTenantSupportPortalPage"));

/**
 * `/suporte/:id` — UUID = ticket do suporte da plataforma (autenticado); caso contrário = portal público do tenant.
 */
export default function SuportePublicOrPlatformTicket() {
  const { id } = useParams<{ id: string }>();

  if (id && isPlatformSupportTicketPathSegment(id)) {
    return (
      <AuthGuard requireAuth={true} redirectTo={`/login?redirect=%2Fsuporte%2F${encodeURIComponent(id)}`}>
        <AppLayout>
          <Suspense fallback={<RouteLoadingFallback />}>
            <PlatformSupportTicketDetail />
          </Suspense>
        </AppLayout>
      </AuthGuard>
    );
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <PublicTenantSupportPortalPage />
    </Suspense>
  );
}
