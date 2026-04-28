import React, { useContext } from "react";
import { SettingsLayoutContext } from "@/layouts/SettingsLayout";
import { CompanyDataSection } from "@/components/settings/CompanyDataSection";
import { UsersSection } from "@/components/settings/UsersSection";
import { BillingSection } from "@/components/settings/BillingSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
import { SecuritySection } from "@/components/settings/SecuritySection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";
import { LeadsSection } from "@/components/settings/LeadsSection";
import { ClientGroupsSection } from "@/components/settings/ClientGroupsSection";
import { WhatsAppSection } from "@/components/settings/WhatsAppSection";
import { ChatTemplatesSettingsSection } from "@/components/settings/ChatTemplatesSettingsSection";
import { DomainSection } from "@/components/settings/DomainSection";
import { UserManagementSection } from "@/components/settings/UserManagementSection";
import { TeamsSection } from "@/components/settings/TeamsSection";
import { MessageTemplatesSection } from "@/components/settings/MessageTemplatesSection";
import { GoogleCalendarSection } from "@/components/settings/GoogleCalendarSection";
import { AgendaAvailabilitySection } from "@/components/settings/AgendaAvailabilitySection";
import { ChatAttendanceSettingsSection } from "@/components/settings/ChatAttendanceSettingsSection";
import { toast } from "@/components/ui/sonner";

const Settings = () => {
  const ctx = useContext(SettingsLayoutContext);
  const activeSection = ctx?.activeSection ?? "companyData";
  const setActiveSection = ctx?.setActiveSection ?? (() => {});

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Configurações salvas com sucesso!");
  };

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
    case "whatsapp":
      return <WhatsAppSection />;
    case "chatTemplates":
      return <ChatTemplatesSettingsSection />;
    case "domain":
      return <DomainSection handleSave={handleSave} />;
    case "messageTemplates":
      return <MessageTemplatesSection handleSave={handleSave} />;
    case "paymentGateway":
      return null;
    case "googleCalendar":
      return <GoogleCalendarSection />;
    case "agendaAvailability":
      return <AgendaAvailabilitySection />;
    case "chatAttendance":
      return <ChatAttendanceSettingsSection />;
    default:
      return <CompanyDataSection handleSave={handleSave} />;
  }
};

export default Settings;
