import React, { useLayoutEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import Settings from "@/pages/Settings";
import { MobileSettingsHome } from "@/components/settings/mobile/MobileSettingsHome";
import { sectionFromQueryParam, settingsPathForSection } from "@/config/settingsNavigation";

/**
 * `/settings` — no mobile: hub central; no desktop: conteúdo da secção ativa (sidebar no layout).
 * Redireciona `?section=` / `?tab=` para rotas com slug no mobile (compatível com links antigos).
 */
export default function SettingsIndex() {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const rawSection = useMemo(
    () =>
      sectionFromQueryParam(searchParams.get("section")) ??
      sectionFromQueryParam(searchParams.get("tab")),
    [searchParams],
  );

  useLayoutEffect(() => {
    if (!isMobile || !rawSection) return;

    const targetBase = settingsPathForSection(rawSection);
    const rest = new URLSearchParams(searchParams);
    rest.delete("section");
    rest.delete("tab");
    const qs = rest.toString();
    navigate(`${targetBase}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [isMobile, navigate, rawSection, searchParams]);

  if (isMobile && rawSection) {
    return (
      <div
        className="min-h-[40dvh] w-full animate-pulse bg-muted/20"
        aria-busy="true"
        aria-label="A abrir configuração"
      />
    );
  }

  if (isMobile) return <MobileSettingsHome />;
  return <Settings />;
}
