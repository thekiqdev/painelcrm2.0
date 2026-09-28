import React from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import Settings from "@/pages/Settings";
import { MobileSettingsSectionScreen } from "@/components/settings/mobile/MobileSettingsSectionScreen";
import { settingSectionFromPathSlug, settingsNavItemBySection } from "@/config/settingsNavigation";

/**
 * Rotas `/settings/:slug` — slug definido em `settingsNavigation` (exceto payments/integrations).
 */
export default function SettingsSectionPage() {
  const { sectionSlug } = useParams<{ sectionSlug: string }>();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const section = sectionSlug ? settingSectionFromPathSlug(sectionSlug) : null;
  const item = section ? settingsNavItemBySection(section) : undefined;

  if (!section || !item) {
    return <Navigate to="/settings" replace />;
  }

  if (isMobile) {
    return (
      <MobileSettingsSectionScreen title={item.title} onBack={() => navigate("/settings")}>
        <Settings />
      </MobileSettingsSectionScreen>
    );
  }

  return <Settings />;
}
