import { useNavigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";

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
 * Na rota "/": no navegador mostra a home (landing); no app instalado (PWA) redireciona para /login.
 */
export default function HomeOrRedirect() {
  const navigate = useNavigate();
  const [isPWA, setIsPWA] = useState<boolean | null>(null);

  useEffect(() => {
    setIsPWA(isStandalonePWA());
  }, []);

  useEffect(() => {
    if (isPWA === true) {
      navigate("/login", { replace: true });
    }
  }, [isPWA, navigate]);

  if (isPWA === true) {
    return <LoadingFallback />;
  }

  if (isPWA === false) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <LandingPage />
      </Suspense>
    );
  }

  return <LoadingFallback />;
}
