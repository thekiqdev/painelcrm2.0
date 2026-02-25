
import React, { useState } from "react";
import { SettingsMenu } from "@/components/settings/SettingsMenu";
import { CompanyDataSection } from "@/components/settings/CompanyDataSection";
import { UsersSection } from "@/components/settings/UsersSection";
import { BillingSection } from "@/components/settings/BillingSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { SecuritySection } from "@/components/settings/SecuritySection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";
import { LeadsSection } from "@/components/settings/LeadsSection";
import { ClientGroupsSection } from "@/components/settings/ClientGroupsSection";
import { WhatsAppSection } from "@/components/settings/WhatsAppSection";
import { DomainSection } from "@/components/settings/DomainSection";
import { CollaboratorsSection } from "@/components/settings/CollaboratorsSection";
import { UserManagementSection } from "@/components/settings/UserManagementSection";
import { TeamsSection } from "@/components/settings/TeamsSection";
import { MessageTemplatesSection } from "@/components/settings/MessageTemplatesSection";
import { toast } from "sonner";

type SettingSection = 
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
  | "messageTemplates";

const Settings = () => {
  const [activeSection, setActiveSection] = useState<SettingSection>("companyData");

  // Default save handler for sections that need it
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Configurações salvas com sucesso!");
  };

  // Renderizar a seção ativa
  const renderActiveSection = () => {
    switch (activeSection) {
      case "companyData":
        return <CompanyDataSection handleSave={handleSave} />;
      case "users":
        return <UsersSection />;
      case "teams":
        return <TeamsSection />;
      case "userManagement":
        return <UserManagementSection />;
      case "billing":
        return <BillingSection />;
      case "notifications":
        return <NotificationsSection handleSave={handleSave} />;
      case "security":
        return <SecuritySection />;
      case "preferences":
        return <PreferencesSection handleSave={handleSave} />;
      case "leadsConfig":
        return <LeadsSection handleSave={handleSave} />;
      case "clientGroups":
        return <ClientGroupsSection />;
      case "collaborators":
        return <CollaboratorsSection />;
      case "whatsapp":
        return <WhatsAppSection />;
      case "domain":
        return <DomainSection handleSave={handleSave} />;
      case "messageTemplates":
        return <MessageTemplatesSection handleSave={handleSave} />;
      default:
        return <CompanyDataSection handleSave={handleSave} />;
    }
  };

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>
      
      <div className="grid grid-cols-12 gap-6">
        {/* Menu lateral */}
        <div className="col-span-3">
          <SettingsMenu activeSection={activeSection} onSelect={setActiveSection} />
        </div>
        
        {/* Conteúdo da seção ativa */}
        <div className="col-span-9">
          {renderActiveSection()}
        </div>
      </div>
    </div>
  );
};

export default Settings;
