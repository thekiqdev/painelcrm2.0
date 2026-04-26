import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  CalendarSync,
  ClipboardCheck,
  CreditCard,
  Ellipsis,
  FileText,
  Home,
  LayoutGrid,
  LifeBuoy,
  List,
  LogOut,
  MessageSquare,
  Newspaper,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UserPlus,
  Users,
} from "lucide-react";
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

type MobileNavItem = {
  key: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
  preload?: () => Promise<unknown>;
};

type MoreLink = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  preload?: () => Promise<unknown>;
};

type MoreGroup = { title: string; items: MoreLink[] };

function isRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isChatMainTabActive(pathname: string): boolean {
  if (pathname.startsWith("/chat/kanbam")) return false;
  return pathname === "/chat" || pathname.startsWith("/chat/");
}

export function MobileAppNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { canView } = useModulePermissions();

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
  const hasProjects = useFeatureFlag("projects");
  const hasTickets = useFeatureFlag("tickets");
  const hasSettings = useFeatureFlag("settings");
  const hasProducts = useFeatureFlag("products");

  const show = (feature: boolean, moduleId: string) => feature && canView(moduleId);

  const [updatesUnread, setUpdatesUnread] = useState(0);
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
    (item): item is MobileNavItem => item !== null
  );

  const moreGroups: MoreGroup[] = [
    {
      title: "Comercial",
      items: [
        show(hasLeads, "leads")
          ? { label: "Leads", to: "/leads", icon: UserPlus, preload: routePreload.leads }
          : null,
        show(hasFunnels, "funnels")
          ? { label: "Funil de vendas", to: "/funnel", icon: List, preload: routePreload.funnel }
          : null,
        show(hasProposals, "proposals")
          ? { label: "Propostas", to: "/proposals", icon: FileText, preload: routePreload.proposals }
          : null,
        show(hasContracts, "contracts")
          ? { label: "Contratos", to: "/contracts", icon: FileText, preload: routePreload.contracts }
          : null,
        show(hasInvoices, "billing")
          ? { label: "Faturas", to: "/customer-invoices", icon: Receipt, preload: routePreload.customerInvoices }
          : null,
        show(hasInvoices, "billing")
          ? {
              label: "Assinaturas",
              to: "/crm-subscriptions",
              icon: CalendarSync,
              preload: routePreload.crmSubscriptions,
            }
          : null,
      ].filter((item): item is MoreLink => item !== null),
    },
    {
      title: "Operação",
      items: [
        show(hasChat, "chat")
          ? { label: "Kanban do chat", to: "/chat/kanbam", icon: LayoutGrid, preload: routePreload.chatKanban }
          : null,
        show(hasTasks, "tasks")
          ? { label: "Tarefas", to: "/tasks", icon: ClipboardCheck, preload: routePreload.tasks }
          : null,
        show(hasProjects, "projects")
          ? { label: "Projetos", to: "/projects", icon: Calendar, preload: routePreload.projects }
          : null,
        show(hasTickets, "tickets")
          ? { label: "Tickets", to: "/support/tickets", icon: LifeBuoy, preload: routePreload.tickets }
          : null,
        show(hasExpenses, "finance")
          ? { label: "Financeiro", to: "/finance", icon: CreditCard, preload: routePreload.finance }
          : null,
        show(hasProducts, "products")
          ? { label: "Pedidos", to: "/orders", icon: ShoppingCart, preload: routePreload.orders }
          : null,
      ].filter((item): item is MoreLink => item !== null),
    },
    {
      title: "Conta e sistema",
      items: [
        show(hasSettings, "settings")
          ? { label: "Configurações", to: "/settings", icon: Settings, preload: routePreload.settings }
          : null,
        { label: "Atualizações", to: "/updates", icon: Newspaper },
        user?.is_super_admin ? { label: "Administração", to: "/superadmin", icon: ShieldCheck } : null,
      ].filter((item): item is MoreLink => item !== null),
    },
  ].filter((g) => g.items.length > 0);

  return (
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
                  : "text-muted-foreground hover:bg-muted/55"
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
                "text-muted-foreground hover:bg-muted/55"
              )}
            >
              <Ellipsis className="h-[1.35rem] w-[1.35rem] shrink-0" />
              <span className="max-w-full truncate">Mais</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="flex h-[min(82dvh,36rem)] max-h-[82vh] flex-col rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 duration-300 ease-out md:hidden"
          >
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
            <SheetHeader className="space-y-1 pb-2 text-left">
              <SheetTitle className="text-lg">Mais</SheetTitle>
              <SheetDescription className="text-xs leading-relaxed">
                Atalhos secundários por área do produto.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-0.5">
              {moreGroups.map((group) => (
                <div key={group.title} className="space-y-2">
                  <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </p>
                  <div className="space-y-0.5 rounded-xl border border-border/60 bg-muted/5 p-1">
                    {group.items.map((item) => (
                      <SheetClose asChild key={`${group.title}-${item.label}`}>
                        <Link
                          to={item.to}
                          onMouseEnter={() => item.preload?.()}
                          className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:bg-muted/70 hover:bg-muted/55"
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="truncate">{item.label}</span>
                            {item.to === "/updates" && updatesUnread > 0 ? (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-primary"
                                title="Novas atualizações"
                                aria-hidden
                              />
                            ) : null}
                          </span>
                        </Link>
                      </SheetClose>
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
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
  );
}
