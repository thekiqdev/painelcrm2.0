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
import { GoogleDriveSection } from "@/components/settings/GoogleDriveSection";
import { AgendaAvailabilitySection } from "@/components/settings/AgendaAvailabilitySection";
import { ChatAttendanceSettingsSection } from "@/components/settings/ChatAttendanceSettingsSection";
import { SupportSettingsSection } from "@/components/settings/SupportSettingsSection";
import { PublicSupportPortalSettingsSection } from "@/components/settings/PublicSupportPortalSettingsSection";
import { ChatAutomationSettingsSection } from "@/components/settings/ChatAutomationSettings";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

const CHAT_AUTOMATION_UI_ENABLED = import.meta.env.VITE_CHAT_AUTOMATION_ENABLED === "true";

const Settings = () => {
  const ctx = useContext(SettingsLayoutContext);
  const activeSection = ctx?.activeSection ?? "companyData";

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
    case "googleDrive":
      return <GoogleDriveSection />;
    case "agendaAvailability":
      return <AgendaAvailabilitySection />;
    case "chatAttendance":
      return <ChatAttendanceSettingsSection />;
    case "support":
      return <SupportSettingsSection />;
    case "publicSupportPortal":
      return <PublicSupportPortalSettingsSection />;
    case "chatAutomation":
      if (!CHAT_AUTOMATION_UI_ENABLED) {
        return (
          <Card>
            <CardHeader>
              <CardTitle>Automação do chat</CardTitle>
              <CardDescription>
                Esta área só aparece quando{" "}
                <code className="rounded bg-muted px-1">VITE_CHAT_AUTOMATION_ENABLED=true</code> está definido no
                ambiente de build.
              </CardDescription>
            </CardHeader>
          </Card>
        );
      }
      return <ChatAutomationSettingsSection />;
    default:
      return <CompanyDataSection handleSave={handleSave} />;
  }
};

export default Settings;
