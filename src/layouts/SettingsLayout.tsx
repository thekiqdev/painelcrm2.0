/**
 * Layout das Configurações: menu lateral + conteúdo (Outlet).
 * Mantém o menu visível em /settings, /settings/payments e /settings/payments/:gatewayKey.
 */
import React, { useState, useCallback } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
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
  | "collaborators"
  | "whatsapp"
  | "domain"
  | "messageTemplates"
  | "paymentGateway";

interface SettingsLayoutContextValue {
  activeSection: SettingSection;
  setActiveSection: (section: SettingSection) => void;
}

export const SettingsLayoutContext = React.createContext<SettingsLayoutContextValue | null>(null);

export default function SettingsLayout() {
  const [activeSection, setActiveSection] = useState<SettingSection>("companyData");
  const location = useLocation();
  const navigate = useNavigate();

  const handleSelect = useCallback(
    (section: SettingSection) => {
      setActiveSection(section);
      if (section !== "paymentGateway" && location.pathname !== "/settings") {
        navigate("/settings");
      }
    },
    [location.pathname, navigate]
  );

  return (
    <SettingsLayoutContext.Provider value={{ activeSection, setActiveSection: handleSelect }}>
      <div className="container mx-auto py-6">
        <h1 className="text-2xl font-bold mb-6">Configurações</h1>
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <SettingsMenu activeSection={activeSection} onSelect={handleSelect} />
          </div>
          <div className="col-span-9">
            <Outlet />
          </div>
        </div>
      </div>
    </SettingsLayoutContext.Provider>
  );
}
