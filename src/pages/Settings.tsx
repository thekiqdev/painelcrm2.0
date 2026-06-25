import React, { lazy, Suspense, useContext } from "react";
import { SettingsLayoutContext } from "@/layouts/SettingsLayout";
import { CompanyDataSection } from "@/components/settings/CompanyDataSection";
import { PageContentSkeleton } from "@/components/PageContentSkeleton";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

const UsersSection = lazy(() =>
  import("@/components/settings/UsersSection").then((m) => ({ default: m.UsersSection })),
);
const TeamsSection = lazy(() =>
  import("@/components/settings/TeamsSection").then((m) => ({ default: m.TeamsSection })),
);
const UserManagementSection = lazy(() =>
  import("@/components/settings/UserManagementSection").then((m) => ({ default: m.UserManagementSection })),
);
const BillingSection = lazy(() =>
  import("@/components/settings/BillingSection").then((m) => ({ default: m.BillingSection })),
);
const NotificationsSection = lazy(() =>
  import("@/components/settings/NotificationsSection").then((m) => ({ default: m.NotificationsSection })),
);
const SecuritySection = lazy(() =>
  import("@/components/settings/SecuritySection").then((m) => ({ default: m.SecuritySection })),
);
const PreferencesSection = lazy(() =>
  import("@/components/settings/PreferencesSection").then((m) => ({ default: m.PreferencesSection })),
);
const LeadsSection = lazy(() =>
  import("@/components/settings/LeadsSection").then((m) => ({ default: m.LeadsSection })),
);
const ClientGroupsSection = lazy(() =>
  import("@/components/settings/ClientGroupsSection").then((m) => ({ default: m.ClientGroupsSection })),
);
const WhatsAppSection = lazy(() =>
  import("@/components/settings/WhatsAppSection").then((m) => ({ default: m.WhatsAppSection })),
);
const ChatTemplatesSettingsSection = lazy(() =>
  import("@/components/settings/ChatTemplatesSettingsSection").then((m) => ({
    default: m.ChatTemplatesSettingsSection,
  })),
);
const DomainSection = lazy(() =>
  import("@/components/settings/DomainSection").then((m) => ({ default: m.DomainSection })),
);
const MessageTemplatesSection = lazy(() =>
  import("@/components/settings/MessageTemplatesSection").then((m) => ({ default: m.MessageTemplatesSection })),
);
const GoogleCalendarSection = lazy(() =>
  import("@/components/settings/GoogleCalendarSection").then((m) => ({ default: m.GoogleCalendarSection })),
);
const GoogleDriveSection = lazy(() =>
  import("@/components/settings/GoogleDriveSection").then((m) => ({ default: m.GoogleDriveSection })),
);
const AgendaAvailabilitySection = lazy(() =>
  import("@/components/settings/AgendaAvailabilitySection").then((m) => ({
    default: m.AgendaAvailabilitySection,
  })),
);
const ChatAttendanceSettingsSection = lazy(() =>
  import("@/components/settings/ChatAttendanceSettingsSection").then((m) => ({
    default: m.ChatAttendanceSettingsSection,
  })),
);
const SupportSettingsSection = lazy(() =>
  import("@/components/settings/SupportSettingsSection").then((m) => ({ default: m.SupportSettingsSection })),
);
const PublicSupportPortalSettingsSection = lazy(() =>
  import("@/components/settings/PublicSupportPortalSettingsSection").then((m) => ({
    default: m.PublicSupportPortalSettingsSection,
  })),
);
const ChatAutomationSettingsSection = lazy(() =>
  import("@/components/settings/ChatAutomationSettings").then((m) => ({
    default: m.ChatAutomationSettingsSection,
  })),
);

const CHAT_AUTOMATION_UI_ENABLED = import.meta.env.VITE_CHAT_AUTOMATION_ENABLED === "true";

function SectionSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageContentSkeleton />}>{children}</Suspense>;
}

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
      return (
        <SectionSuspense>
          <UsersSection />
        </SectionSuspense>
      );
    case "teams":
      return (
        <SectionSuspense>
          <TeamsSection />
        </SectionSuspense>
      );
    case "userManagement":
      return (
        <SectionSuspense>
          <UserManagementSection />
        </SectionSuspense>
      );
    case "billing":
      return (
        <SectionSuspense>
          <BillingSection />
        </SectionSuspense>
      );
    case "notifications":
      return (
        <SectionSuspense>
          <NotificationsSection handleSave={handleSave} />
        </SectionSuspense>
      );
    case "security":
      return (
        <SectionSuspense>
          <SecuritySection />
        </SectionSuspense>
      );
    case "preferences":
      return (
        <SectionSuspense>
          <PreferencesSection handleSave={handleSave} />
        </SectionSuspense>
      );
    case "leadsConfig":
      return (
        <SectionSuspense>
          <LeadsSection handleSave={handleSave} />
        </SectionSuspense>
      );
    case "clientGroups":
      return (
        <SectionSuspense>
          <ClientGroupsSection />
        </SectionSuspense>
      );
    case "whatsapp":
      return (
        <SectionSuspense>
          <WhatsAppSection />
        </SectionSuspense>
      );
    case "chatTemplates":
      return (
        <SectionSuspense>
          <ChatTemplatesSettingsSection />
        </SectionSuspense>
      );
    case "domain":
      return (
        <SectionSuspense>
          <DomainSection handleSave={handleSave} />
        </SectionSuspense>
      );
    case "messageTemplates":
      return (
        <SectionSuspense>
          <MessageTemplatesSection handleSave={handleSave} />
        </SectionSuspense>
      );
    case "paymentGateway":
      return null;
    case "googleCalendar":
      return (
        <SectionSuspense>
          <GoogleCalendarSection />
        </SectionSuspense>
      );
    case "googleDrive":
      return (
        <SectionSuspense>
          <GoogleDriveSection />
        </SectionSuspense>
      );
    case "agendaAvailability":
      return (
        <SectionSuspense>
          <AgendaAvailabilitySection />
        </SectionSuspense>
      );
    case "chatAttendance":
      return (
        <SectionSuspense>
          <ChatAttendanceSettingsSection />
        </SectionSuspense>
      );
    case "support":
      return (
        <SectionSuspense>
          <SupportSettingsSection />
        </SectionSuspense>
      );
    case "publicSupportPortal":
      return (
        <SectionSuspense>
          <PublicSupportPortalSettingsSection />
        </SectionSuspense>
      );
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
      return (
        <SectionSuspense>
          <ChatAutomationSettingsSection />
        </SectionSuspense>
      );
    default:
      return <CompanyDataSection handleSave={handleSave} />;
  }
};

export default Settings;
