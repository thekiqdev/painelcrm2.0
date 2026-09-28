import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  getSettingsNavItems,
  INTEGRATIONS_SUBCATEGORY_ORDER,
  settingSectionFromPathSlug,
  settingsPathForSection,
  SETTINGS_SIDEBAR_CATEGORY_ORDER,
  type SettingSection,
  type SettingsNavItem,
} from "@/config/settingsNavigation";

interface SettingsMenuProps {
  activeSection: SettingSection;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ activeSection }) => {
  const location = useLocation();
  const isPaymentsRoute = location.pathname.startsWith("/settings/payments");

  const menuItems = useMemo(() => getSettingsNavItems(), []);

  const highlightSection = useMemo((): SettingSection => {
    if (
      location.pathname === "/settings/integrations" ||
      location.pathname.endsWith("/settings/integrations")
    ) {
      return "googleCalendar";
    }
    const m = location.pathname.match(/^\/settings\/([^/]+)$/);
    const slug = m?.[1];
    if (slug) {
      const sec = settingSectionFromPathSlug(slug);
      if (sec) return sec;
    }
    if (isPaymentsRoute) return "paymentGateway";
    return activeSection;
  }, [location.pathname, activeSection, isPaymentsRoute]);

  const categorizedItems = useMemo(() => {
    return menuItems.reduce((acc: Record<string, SettingsNavItem[]>, item) => {
      const category = item.sidebarCategory || "Outros";
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});
  }, [menuItems]);

  const integrationSubOrder = INTEGRATIONS_SUBCATEGORY_ORDER as readonly string[];

  const renderMenuButton = (item: SettingsNavItem) => {
    const Icon = item.icon;
    const isPaymentLink = item.id === "paymentGateway";
    const isActive = isPaymentLink ? isPaymentsRoute : highlightSection === item.id;

    if (isPaymentLink) {
      return (
        <Button
          key={item.id}
          variant={isActive ? "secondary" : "ghost"}
          className={cn(
            "w-full shrink-0 justify-start max-md:min-h-10 max-md:min-w-[11rem] max-md:text-left",
            isActive && "bg-secondary",
          )}
          asChild
        >
          <Link to="/settings/payments">
            <Icon className="h-4 w-4" />
            <span className="ml-2">{item.title}</span>
          </Link>
        </Button>
      );
    }

    const href = settingsPathForSection(item.id);

    return (
      <Button
        key={item.id}
        variant={isActive ? "secondary" : "ghost"}
        className={cn(
          "w-full shrink-0 justify-start max-md:min-h-10 max-md:min-w-[11rem] max-md:text-left",
          isActive && "bg-secondary",
        )}
        asChild
      >
        <Link to={href}>
          <Icon className="h-4 w-4" />
          <span className="ml-2">{item.title}</span>
        </Link>
      </Button>
    );
  };

  const categoriesWithItems = SETTINGS_SIDEBAR_CATEGORY_ORDER.filter((c) => categorizedItems[c]?.length);

  return (
    <div className="h-full w-full rounded-md border-0 bg-transparent shadow-none md:rounded-md md:border md:border-border md:bg-card md:shadow-sm">
      <div className="p-3 md:p-4">
        {categoriesWithItems.map((category, catIdx) => {
          const items = categorizedItems[category]!;

          return (
            <div key={category} className="mb-6 last:mb-0">
              <h4 className="mb-2 text-sm font-medium text-muted-foreground">{category}</h4>
              {category === "Integrações" ? (
                <div className="space-y-3">
                  {INTEGRATIONS_SUBCATEGORY_ORDER.map((sub) => {
                    const subItems = items.filter((i) => i.subcategory === sub);
                    if (subItems.length === 0) return null;
                    return (
                      <div key={sub}>
                        <p className="mb-1.5 pl-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                          {sub}
                        </p>
                        <div className="space-y-1">{subItems.map(renderMenuButton)}</div>
                      </div>
                    );
                  })}
                  {(() => {
                    const rest = items.filter((i) => !i.subcategory || !integrationSubOrder.includes(i.subcategory));
                    if (rest.length === 0) return null;
                    return (
                      <div>
                        <p className="mb-1.5 pl-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                          Outros
                        </p>
                        <div className="space-y-1">{rest.map(renderMenuButton)}</div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-1">{items.map(renderMenuButton)}</div>
              )}
              {catIdx < categoriesWithItems.length - 1 ? <Separator className="my-4" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
