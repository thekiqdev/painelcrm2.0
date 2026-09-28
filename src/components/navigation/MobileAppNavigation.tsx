import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, CreditCard, Ellipsis, Home, LayoutGrid, LogOut, MessageSquare, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { announcementsUpdatesService } from "@/services/announcementsUpdates";
import { UPDATES_REFRESH_EVENT } from "@/services/systemNotifications";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { routePreload } from "@/routePreload";
import {
  MOBILE_MORE_ICONS,
  MOBILE_MORE_ITEM_DEFS,
  type MobileMoreMenuContext,
  type MobileMoreQuickActionId,
  buildMobileMoreQuickAccessPrefsFromState,
  computeMobileQuickAccessStrip,
  effectiveMobileMoreQuickAccessPrefs,
  groupIndex,
  isMobileMoreItemVisible,
} from "@/lib/mobileMoreQuickAccess";
import { useMobileMoreQuickAccessPreferences } from "@/hooks/useMobileMoreQuickAccessPreferences";
import { MobileMoreQuickAccessCustomizeDialog } from "@/components/navigation/MobileMoreQuickAccessCustomizeDialog";
import { MobileQuickAccessSortableGrid } from "@/components/navigation/MobileQuickAccessSortableGrid";

type MobileNavItem = {
  key: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
  preload?: () => Promise<unknown>;
};

type MoreItem = {
  id: MobileMoreQuickActionId;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  preload?: () => Promise<unknown>;
};

type MoreGroup = { title: string; items: MoreItem[] };

function isRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isChatMainTabActive(pathname: string): boolean {
  if (pathname.startsWith("/chat/kanbam")) return false;
  return pathname === "/chat" || pathname.startsWith("/chat/");
}

function defToMoreItem(def: (typeof MOBILE_MORE_ITEM_DEFS)[number]): MoreItem {
  const Icon = MOBILE_MORE_ICONS[def.icon];
  const preload = def.preload ? routePreload[def.preload] : undefined;
  return {
    id: def.id,
    label: def.label,
    to: def.to,
    icon: Icon,
    description: def.description,
    preload,
  };
}

function MobileAppNavigationImpl() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { canView } = useModulePermissions();
  const { prefs, setPrefs, reset } = useMobileMoreQuickAccessPreferences(user?.id);

  const hasDashboard = useFeatureFlag("dashboard");
  const hasClients = useFeatureFlag("clients");
  const hasLeads = useFeatureFlag("leads");
  const hasFunnels = useFeatureFlag("funnels");
  const hasChat = useFeatureFlag("chat");
  const hasInvoices = useFeatureFlag("invoices");
  const hasExpenses = useFeatureFlag("expenses");
  const hasProposals = useFeatureFlag("proposals");
  const hasContracts = useFeatureFlag("contracts");
  const hasTasks = useFeatureFlag("tasks");
  const hasAgenda = useFeatureFlag("agenda");
  const hasProjects = useFeatureFlag("projects");
  const hasTickets = useFeatureFlag("tickets");
  const hasChatbotFlows = useFeatureFlag("chatbot_flows");
  const hasSettings = useFeatureFlag("settings");
  const hasProducts = useFeatureFlag("products");

  const show = (feature: boolean, moduleId: string) => feature && canView(moduleId);

  const moreCtx: MobileMoreMenuContext = useMemo(
    () => ({
      flags: {
        dashboard: hasDashboard,
        clients: hasClients,
        leads: hasLeads,
        funnels: hasFunnels,
        products: hasProducts,
        projects: hasProjects,
        tasks: hasTasks,
        agenda: hasAgenda,
        chat: hasChat,
        tickets: hasTickets,
        chatbot_flows: hasChatbotFlows,
        proposals: hasProposals,
        contracts: hasContracts,
        invoices: hasInvoices,
        expenses: hasExpenses,
        settings: hasSettings,
      },
      canView,
      isSuperAdmin: Boolean(user?.is_super_admin),
    }),
    [
      hasDashboard,
      hasClients,
      hasLeads,
      hasFunnels,
      hasProducts,
      hasProjects,
      hasTasks,
      hasAgenda,
      hasChat,
      hasTickets,
      hasChatbotFlows,
      hasProposals,
      hasContracts,
      hasInvoices,
      hasExpenses,
      hasSettings,
      canView,
      user?.is_super_admin,
    ],
  );

  const [updatesUnread, setUpdatesUnread] = useState(0);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    const run = () => {
      void announcementsUpdatesService.unreadCount().then(setUpdatesUnread);
    };
    run();
    window.addEventListener(UPDATES_REFRESH_EVENT, run);
    return () => window.removeEventListener(UPDATES_REFRESH_EVENT, run);
  }, []);

  const homeItem: MobileNavItem | null = show(hasDashboard, "dashboard")
    ? {
        key: "home",
        label: "Início",
        to: "/dashboard",
        icon: Home,
        isActive: (p) => p === "/dashboard",
        preload: routePreload.dashboard,
      }
    : {
        key: "home",
        label: "Início",
        to: "/",
        icon: Home,
        isActive: (p) => p === "/" || p === "",
      };

  const clientsItem: MobileNavItem | null = show(hasClients, "clients")
    ? {
        key: "clients",
        label: "Clientes",
        to: "/clients",
        icon: Users,
        isActive: (p) => isRoutePrefix(p, "/clients"),
        preload: routePreload.clients,
      }
    : null;

  const chargesItem: MobileNavItem | null = show(hasInvoices, "billing")
    ? {
        key: "charges",
        label: "Faturas",
        to: "/customer-invoices",
        icon: CreditCard,
        isActive: (p) => isRoutePrefix(p, "/customer-invoices"),
        preload: routePreload.customerInvoices,
      }
    : null;

  const chatItem: MobileNavItem | null = show(hasChat, "chat")
    ? {
        key: "chat",
        label: "Chat",
        to: "/chat",
        icon: MessageSquare,
        isActive: isChatMainTabActive,
        preload: routePreload.chat,
      }
    : null;

  const bottomItems = [homeItem, clientsItem, chargesItem, chatItem].filter(
    (item): item is MobileNavItem => item !== null,
  );

  const { quickAccessItems, moreMenuGroups } = useMemo((): { quickAccessItems: MoreItem[]; moreMenuGroups: MoreGroup[] } => {
    const visible = MOBILE_MORE_ITEM_DEFS.filter((d) => isMobileMoreItemVisible(d, moreCtx));
    const byGroup = new Map<string, typeof visible>();
    for (const d of visible) {
      const arr = byGroup.get(d.group) ?? [];
      arr.push(d);
      byGroup.set(d.group, arr);
    }
    const groups: MoreGroup[] = [...byGroup.entries()]
      .map(([title, items]) => ({
        title,
        items: [...items].sort((a, b) => a.quickRank - b.quickRank).map(defToMoreItem),
      }))
      .sort((a, b) => groupIndex(a.title) - groupIndex(b.title));

    const strip = computeMobileQuickAccessStrip(moreCtx, prefs);
    const quickAccessItems: MoreItem[] = strip.map((s) => ({
      id: s.id,
      label: s.label,
      to: s.to,
      icon: s.icon,
      preload: s.preload,
    }));

    return { quickAccessItems, moreMenuGroups: groups };
  }, [moreCtx, prefs]);

  const handleQuickAccessReorder = useCallback(
    (orderedIds: MobileMoreQuickActionId[]) => {
      const eff = effectiveMobileMoreQuickAccessPrefs(moreCtx, prefs);
      setPrefs(buildMobileMoreQuickAccessPrefsFromState(orderedIds, eff.disabledIds));
    },
    [moreCtx, prefs, setPrefs],
  );

  return (
    <>
      <MobileMoreQuickAccessCustomizeDialog
        ctx={moreCtx}
        prefs={prefs}
        setPrefs={setPrefs}
        resetPrefs={reset}
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
      />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/90 md:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-between gap-0.5">
        {bottomItems.map((item) => {
          const active = item.isActive(location.pathname);
          return (
            <Link
              key={item.key}
              to={item.to}
              onMouseEnter={() => item.preload?.()}
              className={cn(
                "flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-[11px] font-semibold transition-colors active:bg-muted/50",
                active
                  ? "bg-primary/14 text-primary shadow-sm ring-1 ring-primary/20"
                  : "text-muted-foreground hover:bg-muted/55",
              )}
            >
              <item.icon className={cn("h-[1.35rem] w-[1.35rem] shrink-0", active ? "text-primary" : "")} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 text-[11px] font-semibold transition-colors active:bg-muted/50",
                "text-muted-foreground hover:bg-muted/55",
              )}
            >
              <Ellipsis className="h-[1.35rem] w-[1.35rem] shrink-0" />
              <span className="max-w-full truncate">Mais</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="flex h-[min(88dvh,42rem)] max-h-[92vh] flex-col rounded-t-3xl border-border/60 bg-gradient-to-b from-background to-muted/20 px-0 pb-0 pt-0 duration-300 ease-out dark:from-background dark:to-muted/10 md:hidden"
          >
            <div className="flex shrink-0 flex-col border-b border-border/50 bg-card/30 px-4 pb-3 pt-2 dark:bg-card/20">
              <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/20" aria-hidden />
              <SheetHeader className="space-y-1.5 p-0 pr-10 text-left">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <LayoutGrid className="h-4 w-4" aria-hidden />
                  </div>
                  <div>
                    <SheetTitle className="text-left text-base font-semibold tracking-tight">Explorar o painel</SheetTitle>
                    <SheetDescription className="text-left text-xs leading-snug text-muted-foreground">
                      Todas as áreas por categoria. Personalize o acesso rápido ao seu fluxo.
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
            </div>

            <div className="min-h-0 flex-1 space-y-0 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {quickAccessItems.length > 0 ? (
                <section className="mb-6 rounded-2xl border border-primary/15 bg-primary/[0.04] p-3 dark:bg-primary/[0.06]" aria-label="Acesso rápido">
                  <div className="mb-2.5 flex items-start justify-between gap-2 pl-0.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-semibold text-foreground">Acesso rápido</h3>
                      <p className="text-[11px] text-muted-foreground">
                        Use o ícone no canto de cada azulejo para reordenar; toque no azulejo para abrir.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 rounded-full border-border/80 bg-background/90 px-2.5 shadow-sm"
                        onClick={() => setCustomizeOpen(true)}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                        <span className="text-xs font-medium">Personalizar</span>
                      </Button>
                      <Sparkles className="h-3.5 w-3.5 text-amber-500/90" aria-hidden />
                    </div>
                  </div>
                  <MobileQuickAccessSortableGrid items={quickAccessItems} onOrderChange={handleQuickAccessReorder} />
                </section>
              ) : (
                <div className="mb-4 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 rounded-full border-border/80 bg-background/90 px-2.5 shadow-sm"
                    onClick={() => setCustomizeOpen(true)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                    <span className="text-xs font-medium">Personalizar acesso rápido</span>
                  </Button>
                </div>
              )}

              <div className="space-y-5 pb-2">
                {moreMenuGroups.map((group) => (
                  <section key={group.title} className="space-y-2.5" aria-label={group.title}>
                    <div className="flex items-center gap-2 border-b border-border/40 pb-1.5 pl-0.5">
                      <div className="h-1 w-1 rounded-full bg-primary/60" aria-hidden />
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        {group.title}
                      </h4>
                    </div>
                    <ul className="space-y-1 rounded-2xl border border-border/50 bg-card/40 p-1.5 dark:border-border/40 dark:bg-card/25">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <SheetClose asChild>
                            <Link
                              to={item.to}
                              onMouseEnter={() => item.preload?.()}
                              className="flex min-h-[3.75rem] w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium text-foreground transition-colors active:bg-muted/70 hover:bg-muted/50"
                            >
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/30 bg-background/60 dark:bg-background/40">
                                <item.icon className="h-5 w-5 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="truncate">{item.label}</span>
                                  {item.id === "updates" && updatesUnread > 0 ? (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full bg-primary"
                                      title="Novas atualizações"
                                      aria-label="Há novas atualizações"
                                    />
                                  ) : null}
                                </div>
                                {item.description ? (
                                  <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{item.description}</p>
                                ) : null}
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                            </Link>
                          </SheetClose>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <div className="mt-2 border-t border-border/50 bg-muted/10 py-1 dark:bg-muted/5">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full min-h-12 justify-start gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={async () => {
                    await signOut();
                    navigate("/login");
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
    </>
  );
}

export const MobileAppNavigation = React.memo(MobileAppNavigationImpl);
