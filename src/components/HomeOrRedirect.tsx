import { useNavigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { getPostAuthHomePath } from "@/utils/superAdminRedirect";

const LandingPage = lazy(() => import("../landingpage").then((m) => ({ default: m.LandingPage })));

const LoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-crm-primary border-t-transparent" />
  </div>
);

/**
 * Retorna true se o app foi aberto como PWA (instalado, janela própria).
 * No navegador normal (aba) retorna false.
 */
function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  // display-mode: standalone (Chrome/Edge PWA no Windows, etc.)
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari em “Add to Home Screen”
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true;
  // Alguns Android: referrer vazio quando aberto como PWA
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  return false;
}

/**
 * Na rota "/":
 * - Desktop (navegador, não PWA): landing para visitantes.
 * - Mobile (mesmo breakpoint que o shell, max-width 767px) ou PWA: se já autenticado, vai direto para o app (dashboard, superadmin ou register/steps).
 * - PWA sem sessão: /login (comportamento anterior).
 */
export default function HomeOrRedirect() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const [isPWA] = useState(() => isStandalonePWA());

  useEffect(() => {
    if (loading) return;
    const loggedIn = Boolean(user);
    if (loggedIn && (isMobile || isPWA)) {
      navigate(getPostAuthHomePath(user), { replace: true });
      return;
    }
    if (isPWA && !loggedIn) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, isMobile, isPWA, navigate]);

  if (loading) {
    return <LoadingFallback />;
  }

  const loggedIn = Boolean(user);
  if (loggedIn && (isMobile || isPWA)) {
    return <LoadingFallback />;
  }
  if (isPWA && !loggedIn) {
    return <LoadingFallback />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <LandingPage />
    </Suspense>
  );
}
