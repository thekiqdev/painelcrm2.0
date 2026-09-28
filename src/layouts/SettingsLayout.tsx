/**
 * Layout das Configurações: desktop = menu lateral + conteúdo; mobile = hub ou secção em ecrã inteiro.
 * Mantém o menu visível em rotas /settings/payments.
 */
import React, { useState, useCallback, useEffect } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SettingsMenu } from "@/components/settings/SettingsMenu";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  sectionFromQueryParam,
  settingSectionFromPathSlug,
  settingsPathForSection,
  type SettingSection,
} from "@/config/settingsNavigation";

export type { SettingSection } from "@/config/settingsNavigation";

interface SettingsLayoutContextValue {
  activeSection: SettingSection;
  setActiveSection: (section: SettingSection) => void;
}

export const SettingsLayoutContext = React.createContext<SettingsLayoutContextValue | null>(null);

export default function SettingsLayout() {
  const [activeSection, setActiveSectionState] = useState<SettingSection>("companyData");
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!location.pathname.startsWith("/settings") || location.pathname.startsWith("/settings/payments")) {
      return;
    }
    if (location.pathname === "/settings/integrations" || location.pathname.endsWith("/settings/integrations")) {
      setActiveSectionState("googleCalendar");
      return;
    }

    const slugMatch = location.pathname.match(/^\/settings\/([^/]+)$/);
    if (slugMatch?.[1]) {
      const sec = settingSectionFromPathSlug(slugMatch[1]);
      if (sec) {
        setActiveSectionState(sec);
        return;
      }
    }

    const s =
      sectionFromQueryParam(searchParams.get("section")) ?? sectionFromQueryParam(searchParams.get("tab"));
    if (s) setActiveSectionState(s);
  }, [location.pathname, searchParams]);

  const handleSelect = useCallback(
    (section: SettingSection) => {
      setActiveSectionState(section);
      if (section === "paymentGateway") {
        navigate("/settings/payments");
        return;
      }
      navigate(settingsPathForSection(section));
    },
    [navigate],
  );

  return (
    <SettingsLayoutContext.Provider value={{ activeSection, setActiveSection: handleSelect }}>
      {isMobile ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
          <Outlet />
        </div>
      ) : (
        <div className="container mx-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:px-4 md:py-6">
          <h1 className="mb-4 text-xl font-bold text-foreground md:mb-6 md:text-2xl">Configurações</h1>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-6">
            <div className="min-w-0 md:col-span-3">
              <div className="max-md:max-h-[min(56vh,28rem)] max-md:overflow-y-auto max-md:rounded-xl max-md:border max-md:border-border max-md:bg-card max-md:shadow-sm md:max-h-none md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
                <SettingsMenu activeSection={activeSection} />
              </div>
            </div>
            <div className="min-w-0 md:col-span-9">
              <div className="max-md:rounded-xl max-md:border max-md:border-border max-md:bg-card/80 max-md:p-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
                <Outlet />
              </div>
            </div>
          </div>
        </div>
      )}
    </SettingsLayoutContext.Provider>
  );
}
