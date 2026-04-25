/**
 * Layout das Configurações: menu lateral + conteúdo (Outlet).
 * Mantém o menu visível em /settings, /settings/payments e /settings/payments/:gatewayKey.
 */
import React, { useState, useCallback, useEffect } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SettingsMenu } from "@/components/settings/SettingsMenu";

export type SettingSection =
  | "companyData"
  | "users"
  | "teams"
  | "userManagement"
  | "billing"
  | "notifications"
  | "security"
  | "preferences"
  | "leadsConfig"
  | "clientGroups"
  | "whatsapp"
  | "chatTemplates"
  | "domain"
  | "messageTemplates"
  | "paymentGateway";

interface SettingsLayoutContextValue {
  activeSection: SettingSection;
  setActiveSection: (section: SettingSection) => void;
}

export const SettingsLayoutContext = React.createContext<SettingsLayoutContextValue | null>(null);

const SECTION_QUERY_VALUES: SettingSection[] = [
  "companyData",
  "users",
  "teams",
  "userManagement",
  "billing",
  "notifications",
  "security",
  "preferences",
  "leadsConfig",
  "clientGroups",
  "whatsapp",
  "chatTemplates",
  "domain",
  "messageTemplates",
  "paymentGateway",
];

function sectionFromQuery(raw: string | null): SettingSection | null {
  if (!raw) return null;
  return SECTION_QUERY_VALUES.includes(raw as SettingSection) ? (raw as SettingSection) : null;
}

export default function SettingsLayout() {
  const [activeSection, setActiveSection] = useState<SettingSection>("companyData");
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!location.pathname.startsWith("/settings") || location.pathname.startsWith("/settings/payments")) {
      return;
    }
    const s =
      sectionFromQuery(searchParams.get("section")) ?? sectionFromQuery(searchParams.get("tab"));
    if (s) setActiveSection(s);
  }, [location.pathname, searchParams]);

  const handleSelect = useCallback(
    (section: SettingSection) => {
      setActiveSection(section);
      if (section === "paymentGateway") {
        navigate("/settings/payments");
        return;
      }
      navigate(`/settings?section=${encodeURIComponent(section)}`, { replace: true });
    },
    [navigate]
  );

  return (
    <SettingsLayoutContext.Provider value={{ activeSection, setActiveSection: handleSelect }}>
      <div className="container mx-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:px-4 md:py-6">
        <h1 className="mb-4 text-xl font-bold text-foreground md:mb-6 md:text-2xl">Configurações</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-6">
          <div className="min-w-0 md:col-span-3">
            <div className="max-md:max-h-[min(56vh,28rem)] max-md:overflow-y-auto max-md:rounded-xl max-md:border max-md:border-border max-md:bg-card max-md:shadow-sm md:max-h-none md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
              <SettingsMenu activeSection={activeSection} onSelect={handleSelect} />
            </div>
          </div>
          <div className="min-w-0 md:col-span-9">
            <div className="max-md:rounded-xl max-md:border max-md:border-border max-md:bg-card/80 max-md:p-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </SettingsLayoutContext.Provider>
  );
}
