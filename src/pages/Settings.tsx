import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Building, Users, Globe, CreditCard, Bell, Settings as SettingsIcon, Shield, MessageSquare, UserRound } from "lucide-react";
import { useLocation } from "react-router-dom";
import { SettingsMenu } from "@/components/settings/SettingsMenu";
import { CompanyDataSection } from "@/components/settings/CompanyDataSection";
import { UsersSection } from "@/components/settings/UsersSection";
import { CollaboratorsSection } from "@/components/settings/CollaboratorsSection";
import { DomainSection } from "@/components/settings/DomainSection";
import { BillingSection } from "@/components/settings/BillingSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";
import { SecuritySection } from "@/components/settings/SecuritySection";
import { WhatsAppSection } from "@/components/settings/WhatsAppSection";
import { ClientGroupsSection } from "@/components/settings/ClientGroupsSection";
import { SettingsMenuItemProps } from "@/components/settings/types";

const Settings = () => {
  const [activeSettingsTab, setActiveSettingsTab] = useState("company");
  const location = useLocation();

  // Check for URL parameters on component mount
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get("tab");
    
    // If tab parameter exists and is one of our valid tabs, set it as active
    if (tabParam && ["company", "whatsapp", "users", "collaborators", "domain", 
                     "billing", "notifications", "preferences", "security", "clients"].includes(tabParam)) {
      setActiveSettingsTab(tabParam);
    }
  }, [location]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Configurações salvas com sucesso!");
  };

  // Define the settings menu items
  const settingsMenuItems: SettingsMenuItemProps[] = [
    { id: "company", label: "Dados da Empresa", icon: <Building className="mr-2 h-5 w-5" /> },
    { id: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="mr-2 h-5 w-5" /> },
    { id: "users", label: "Usuários & Permissões", icon: <Users className="mr-2 h-5 w-5" /> },
    { id: "collaborators", label: "Colaboradores", icon: <Users className="mr-2 h-5 w-5" /> },
    { id: "clients", label: "Clientes", icon: <UserRound className="mr-2 h-5 w-5" /> },
    { id: "domain", label: "Domínio e URLs", icon: <Globe className="mr-2 h-5 w-5" /> },
    { id: "billing", label: "Pagamentos e Faturamento", icon: <CreditCard className="mr-2 h-5 w-5" /> },
    { id: "notifications", label: "Notificações", icon: <Bell className="mr-2 h-5 w-5" /> },
    { id: "preferences", label: "Preferências Gerais", icon: <SettingsIcon className="mr-2 h-5 w-5" /> },
    { id: "security", label: "Segurança", icon: <Shield className="mr-2 h-5 w-5" /> },
  ];

  // Render the content based on the active settings tab
  const renderSettingsContent = () => {
    switch (activeSettingsTab) {
      case "company":
        return <CompanyDataSection handleSave={handleSave} />;
      case "whatsapp":
        return <WhatsAppSection />;
      case "users":
        return <UsersSection />;
      case "collaborators":
        return <CollaboratorsSection />;
      case "clients":
        return <ClientGroupsSection handleSave={handleSave} />;
      case "domain":
        return <DomainSection handleSave={handleSave} />;
      case "billing":
        return <BillingSection />;
      case "notifications":
        return <NotificationsSection handleSave={handleSave} />;
      case "preferences":
        return <PreferencesSection handleSave={handleSave} />;
      case "security":
        return <SecuritySection />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <SettingsMenu 
          menuItems={settingsMenuItems}
          activeTab={activeSettingsTab}
          setActiveTab={setActiveSettingsTab}
        />
      </div>

      {renderSettingsContent()}
    </div>
  );
};

export default Settings;
