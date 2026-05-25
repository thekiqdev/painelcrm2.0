
import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  User,
  LayoutDashboard,
  Users,
  List,
  Calendar,
  FileText,
  FileSearch,
  Settings,
  UserPlus,
  ClipboardCheck,
  MessageSquare,
  LogOut,
  Search,
  LayoutTemplate,
  Ticket,
  ShieldCheck,
  CreditCard,
  LayoutGrid,
  Store,
  Package,
  ShoppingCart,
  CalendarSync,
  Landmark,
  Receipt,
  PieChart,
  ArrowLeftRight,
  Tags,
  ClipboardList,
  Newspaper,
  Plus,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarTrigger,
  SidebarProvider,
  useSidebar
} from "@/components/ui/sidebar";
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { normalizeCatalogMediaUrlForBrowser } from '@/services/catalogMediaUpload';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { Command, CommandDialog, CommandInput } from '@/components/ui/command';
import {
  GlobalSearchPanelContent,
  type GlobalSearchVisibility,
} from '@/components/layout/GlobalSearchPanelContent';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useDebouncedGlobalGroupedSearch } from '@/hooks/useGlobalSearch';
import { TenantBrandProvider } from '@/contexts/TenantBrandContext';
import { TenantSidebarMark } from '@/components/tenant/TenantMarks';
import { RequireModuleView } from '@/components/RequireModuleView';
import { ThemeToggle } from '@/components/ThemeToggle';
import { routePreload } from '@/routePreload';
import {
  prefetchClientsListNav,
  prefetchDashboardOverview,
  prefetchChatWarm,
  prefetchLeadsListNav,
  prefetchTasksSummaryNav,
} from '@/lib/prefetchAppData';
import { scheduleIdleChatPrefetch } from '@/lib/chatPrefetch';
import { cn } from '@/lib/utils';
import { MobileAppNavigation } from '@/components/navigation/MobileAppNavigation';
import {
  MobileShellChromeProvider,
  useMobileShellChrome,
} from '@/contexts/MobileShellChromeContext';
import { useInAppNotificationBadges } from '@/hooks/useInAppNotificationBadges';
import { useChatNavUnreadCount } from '@/hooks/useChatNavUnreadCount';
import { useTicketMenuCount } from '@/hooks/useTicketMenuCount';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { HeaderNotificationBell } from '@/components/layout/HeaderNotificationBell';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FloatingChatProvider, FloatingChatWidget, useFloatingChat } from '@/features/floating-chat';

interface AppLayoutProps {
  children: React.ReactNode;
}

/** Coluna principal: `main` + bottom nav, com padding ajustável quando um fluxo full screen suprime a tab bar. */
function AppMainColumn({ children }: { children: React.ReactNode }) {
  const { suppressMobileBottomNav, showMobileGlobalHeader } = useMobileShellChrome();
  return (
    <>
      <main
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden px-4 pb-28 md:mx-auto md:w-full md:max-w-7xl md:px-6 md:pb-6',
          suppressMobileBottomNav && 'max-md:!pb-4',
          /* Sem header global no mobile: safe area no topo (o header já trazia pt safe). */
          showMobileGlobalHeader
            ? 'pt-4 md:pt-6'
            : 'max-md:pt-[max(1rem,env(safe-area-inset-top,0px))] md:pt-6',
        )}
      >
        <RequireModuleView>{children}</RequireModuleView>
      </main>
      {!suppressMobileBottomNav ? <MobileAppNavigation /> : null}
    </>
  );
}

const Nav = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const userId = user?.id ?? "";

  const { canView, hasPermissionKey } = useModulePermissions();
  const hasDashboard = useFeatureFlag('dashboard');
  const hasClients = useFeatureFlag('clients');
  const hasLeads = useFeatureFlag('leads');
  const hasFunnels = useFeatureFlag('funnels');
  const hasProducts = useFeatureFlag('products');
  const hasProjects = useFeatureFlag('projects');
  const hasTasks = useFeatureFlag('tasks');
  const hasAgenda = useFeatureFlag('agenda');
  const hasChat = useFeatureFlag('chat');
  const hasTickets = useFeatureFlag('tickets');
  const hasProposals = useFeatureFlag('proposals');
  const hasContracts = useFeatureFlag('contracts');
  const hasInvoices = useFeatureFlag('invoices');
  const hasExpenses = useFeatureFlag('expenses');
  const hasSettings = useFeatureFlag('settings');

  useEffect(() => {
    const t = setTimeout(() => {
      routePreload.dashboard();
      routePreload.clients();
      routePreload.tasks();
      routePreload.agenda();
      routePreload.projects();
      routePreload.products();
      if (tenantId && userId) {
        prefetchDashboardOverview(
          tenantId,
          userId,
          hasDashboard && canView('dashboard'),
        );
        prefetchTasksSummaryNav(
          tenantId,
          userId,
          hasTasks && canView('tasks') && hasPermissionKey('tasks.view'),
        );
        if (hasChat && canView('chat')) {
          routePreload.chat();
          scheduleIdleChatPrefetch(() => {
            prefetchChatWarm(tenantId, userId, Boolean(user?.tenant_id));
          });
        }
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [
    tenantId,
    userId,
    user?.tenant_id,
    hasDashboard,
    hasTasks,
    hasChat,
    canView,
    hasPermissionKey,
  ]);

  const show = (feature: boolean, moduleId: string) => feature && canView(moduleId);

  const navLinkClassFn = (isActive: boolean) =>
    cn(
      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
    isActive
        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm'
        : 'text-sidebar-foreground/90 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground',
    );

  function NavLinkItem({
    to,
    end,
    icon: Icon,
    label,
    preload,
    excludeActiveWhenPathStartsWith,
  }: {
    to: string;
    end?: boolean;
    icon: LucideIcon;
    label: string;
    preload?: () => void;
    /** Evita match por prefixo (ex.: `/finance/accounts` vs `/finance/accounts-payable`). */
    excludeActiveWhenPathStartsWith?: string;
  }) {
    const { pathname } = useLocation();
    const excluded =
      Boolean(excludeActiveWhenPathStartsWith) && pathname.startsWith(excludeActiveWhenPathStartsWith!);
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={label}>
          <NavLink
            to={to}
            end={end}
            onMouseEnter={preload}
            className={({ isActive }) => navLinkClassFn(isActive && !excluded)}
          >
            <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  function ChatSidebarNavItem() {
    const chatAllowed = show(hasChat, 'chat');
    const unread = useChatNavUnreadCount(chatAllowed);
    const badgeLabel =
      unread <= 0 ? null : unread > 99 ? '99+' : unread > 9 ? '9+' : String(unread);

    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip="Chat">
          <NavLink
            to="/chat"
            end
            onMouseEnter={() => {
              routePreload.chat();
              prefetchChatWarm(tenantId, userId, Boolean(user?.tenant_id));
            }}
            className={({ isActive }) =>
              cn(navLinkClassFn(isActive), 'relative', badgeLabel && 'gap-2')
            }
          >
            <MessageSquare className="size-4 shrink-0 opacity-90" aria-hidden />
            {!collapsed ? (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">Chat</span>
                {badgeLabel ? (
                  <span
                    className={cn(
                      'flex h-5 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full',
                      'bg-primary px-1.5 text-[10px] font-semibold tabular-nums leading-none text-primary-foreground',
                    )}
                  >
                    {badgeLabel}
                  </span>
                ) : null}
              </span>
            ) : badgeLabel ? (
              <span
                className={cn(
                  'pointer-events-none absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full',
                  'bg-primary px-0.5 text-[9px] font-bold tabular-nums leading-none text-primary-foreground',
                )}
                aria-hidden
              >
                {badgeLabel}
              </span>
            ) : null}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  function TicketSidebarNavItem() {
    const ticketsAllowed = show(hasTickets, 'tickets');
    const count = useTicketMenuCount(ticketsAllowed);
    const badgeLabel = count <= 0 ? null : count > 99 ? '99+' : String(count);

    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip="Tickets">
          <NavLink
            to="/support/tickets"
            onMouseEnter={() => routePreload.tickets()}
            className={({ isActive }) => cn(navLinkClassFn(isActive), 'relative', badgeLabel && 'gap-2')}
          >
            <Ticket className="size-4 shrink-0 opacity-90" aria-hidden />
            {!collapsed ? (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">Tickets</span>
                {badgeLabel ? (
                  <span className="flex h-5 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold tabular-nums leading-none text-white">
                    {badgeLabel}
                  </span>
                ) : null}
              </span>
            ) : badgeLabel ? (
              <span
                className="pointer-events-none absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold leading-none text-white"
                aria-hidden
              >
                {badgeLabel}
              </span>
            ) : null}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border/70 bg-sidebar/95 shadow-sm transition-[width] duration-300"
    >
      <SidebarHeader
      className={cn(
          'border-0 p-2',
          collapsed
            ? 'flex flex-col items-stretch gap-1.5'
            : 'flex flex-row items-center justify-between gap-2',
        )}
      >
        {collapsed ? (
          <>
            <div className="flex justify-end">
              <SidebarTrigger
                className="h-8 w-8 shrink-0 rounded-md hover:bg-sidebar-accent/60"
                aria-label="Recolher ou expandir o menu"
              />
            </div>
            <TenantSidebarMark
              collapsed
              className="!mb-2 px-0 pb-0"
            />
          </>
        ) : (
          <>
            <TenantSidebarMark
              collapsed={false}
              className="!mb-0 min-w-0 flex-1 px-0 pb-0"
            />
            <SidebarTrigger
              className="h-8 w-8 shrink-0 rounded-md hover:bg-sidebar-accent/60"
              aria-label="Recolher ou expandir o menu"
            />
          </>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0.5">
        <SidebarGroup className="py-1.5">
          <SidebarMenu className="gap-0.5">
            {show(hasDashboard, 'dashboard') && (
              <NavLinkItem
                to="/dashboard"
                icon={LayoutDashboard}
                label="Dashboard"
                preload={() => {
                  routePreload.dashboard();
                  prefetchDashboardOverview(
                    tenantId,
                    userId,
                    show(hasDashboard, 'dashboard'),
                  );
                }}
              />
            )}
          </SidebarMenu>
        </SidebarGroup>
        
        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            Relacionamento
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasClients, 'clients') && (
                <NavLinkItem
                  to="/clients"
                  icon={Users}
                  label="Clientes"
                  preload={() => {
                    routePreload.clients();
                    prefetchClientsListNav(
                      tenantId,
                      userId,
                      show(hasClients, 'clients') && hasPermissionKey('clients.view'),
                    );
                  }}
                />
              )}
              {show(hasLeads, 'leads') && (
                <NavLinkItem
                  to="/leads"
                  icon={UserPlus}
                  label="Leads"
                  preload={() => {
                    routePreload.leads();
                    prefetchLeadsListNav(
                      tenantId,
                      userId,
                      show(hasLeads, 'leads') && hasPermissionKey('leads.view'),
                    );
                  }}
                />
              )}
              {show(hasAgenda, 'agenda') && (
                <NavLinkItem to="/agenda" icon={CalendarDays} label="Agenda" preload={() => routePreload.agenda()} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            Atendimento
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasChat, 'chat') && <ChatSidebarNavItem />}
              {show(hasChat, 'chat') && (
                <NavLinkItem to="/chat/kanbam" icon={LayoutGrid} label="Kanban" preload={() => routePreload.chatKanban()} />
              )}
              {show(hasTickets, 'tickets') && (
                <TicketSidebarNavItem />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {show(hasInvoices, 'billing') &&
        (hasPermissionKey('billing.view_invoices') ||
          hasPermissionKey('billing.view_charges') ||
          hasPermissionKey('billing.view_subscriptions')) ? (
          <SidebarGroup className="py-1.5">
            <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
              Faturamento
            </SidebarGroupLabel>
          <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {hasPermissionKey('billing.view_invoices') ? (
                <NavLinkItem
                  to="/customer-invoices"
                  icon={FileText}
                  label="Faturas"
                  preload={() => routePreload.customerInvoices()}
                />
                ) : null}
                {hasPermissionKey('billing.view_charges') ? (
                <NavLinkItem
                  to="/customer-charges"
                  icon={CreditCard}
                  label="Cobranças"
                  preload={() => routePreload.customerCharges()}
                />
                ) : null}
                {hasPermissionKey('billing.view_subscriptions') ? (
                <NavLinkItem
                  to="/crm-subscriptions"
                  icon={CalendarSync}
                  label="Assinaturas"
                  preload={() => routePreload.crmSubscriptions()}
                />
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            Documentação
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasProposals, 'proposals') && (
                <NavLinkItem to="/proposals" icon={FileText} label="Propostas" preload={() => routePreload.proposals()} />
              )}
              {show(hasContracts, 'contracts') && (
                <NavLinkItem to="/contracts" icon={FileSearch} label="Contratos" preload={() => routePreload.contracts()} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            Projetos
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasProjects, 'projects') && (
                <NavLinkItem to="/projects" icon={Calendar} label="Projetos" preload={() => routePreload.projects()} />
              )}
              {show(hasTasks, 'tasks') && (
                <NavLinkItem
                  to="/tasks"
                  icon={ClipboardCheck}
                  label="Tarefas"
                  preload={() => {
                    routePreload.tasks();
                    prefetchTasksSummaryNav(tenantId, userId);
                  }}
                />
              )}
              {show(hasTasks, 'project_templates') && (
                <NavLinkItem
                  to="/project-templates"
                  icon={LayoutTemplate}
                  label="Templates"
                  preload={() => routePreload.projectTemplates()}
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {show(hasFunnels, 'funnels') && (
          <SidebarGroup className="py-1.5">
            <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
              Vendas
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <NavLinkItem to="/funnel" icon={List} label="Funil de Vendas" preload={() => routePreload.funnel()} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            Loja online
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasProducts, 'products') && (
                <>
                  <NavLinkItem to="/admin/products" icon={Package} label="Catálogo" preload={() => routePreload.products()} />
                  <NavLinkItem to="/orders" icon={ShoppingCart} label="Pedidos" preload={() => routePreload.orders()} />
                  <NavLinkItem to="/admin/loja" icon={Store} label="Configuração da loja" preload={() => routePreload.storeSettings()} />
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {show(hasExpenses, 'finance') &&
        (hasPermissionKey('finance.view') ||
          hasPermissionKey('finance.view_revenue') ||
          hasPermissionKey('finance.view_expenses') ||
          hasPermissionKey('finance.view_accounts_payable') ||
          hasPermissionKey('finance.view_reports')) ? (
        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            Financeiro
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
                <>
                  {hasPermissionKey('finance.view') ? (
                  <NavLinkItem to="/finance" end icon={LayoutDashboard} label="Resumo geral" preload={() => routePreload.finance()} />
                  ) : null}
                  {hasPermissionKey('finance.view') ? (
                  <NavLinkItem
                    to="/finance/accounts"
                    icon={Landmark}
                    label="Bancos e contas"
                    excludeActiveWhenPathStartsWith="/finance/accounts-payable"
                    preload={() => routePreload.finance()}
                  />
                  ) : null}
                  {hasPermissionKey('finance.view_revenue') || hasPermissionKey('finance.view_expenses') ? (
                  <NavLinkItem
                    to="/finance/transactions"
                    icon={ArrowLeftRight}
                    label="Entradas e saídas"
                    preload={() => routePreload.finance()}
                  />
                  ) : null}
                  {hasPermissionKey('finance.view_accounts_payable') ? (
                  <NavLinkItem
                    to="/finance/accounts-payable"
                    icon={ClipboardList}
                    label="Contas a pagar"
                    preload={() => routePreload.finance()}
                  />
                  ) : null}
                  {hasPermissionKey('finance.view') ? (
                  <NavLinkItem
                    to="/finance/credit-cards"
                    icon={CreditCard}
                    label="Cartões de crédito"
                    preload={() => routePreload.finance()}
                  />
                  ) : null}
                  {hasPermissionKey('finance.view_expenses') ? (
                  <NavLinkItem to="/finance/categories" icon={Tags} label="Categorias" preload={() => routePreload.finance()} />
                  ) : null}
                  {hasPermissionKey('finance.view_reports') ? (
                  <NavLinkItem to="/finance/relatorios" icon={PieChart} label="Relatórios" preload={() => routePreload.finance()} />
                  ) : null}
                </>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ) : null}
        
        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            Configurações
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
            {show(hasSettings, 'settings') && (
                <NavLinkItem to="/settings" icon={Settings} label="Configurações" preload={() => routePreload.settings()} />
            )}
          </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

const CREATE_MENU_ITEM_CLASS =
  'gap-2 rounded-lg text-foreground/90 focus:bg-muted/70 focus:text-foreground data-[highlighted]:bg-muted/70 data-[highlighted]:text-foreground';

const Header = () => {
  const { user, profile, signOut } = useAuth();
  const { canView, canCreate, hasPermissionKey } = useModulePermissions();
  const { showMobileGlobalHeader } = useMobileShellChrome();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const floatingChatCtx = useFloatingChat();
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commandSearchQuery, setCommandSearchQuery] = useState('');
  const [desktopSearchInteracted, setDesktopSearchInteracted] = useState(false);
  const [commandSearchInteracted, setCommandSearchInteracted] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const [commandSearchFocused, setCommandSearchFocused] = useState(false);
  const [desktopSearchArmed, setDesktopSearchArmed] = useState(false);
  const [commandSearchArmed, setCommandSearchArmed] = useState(false);

  useEffect(() => {
    // A cada mudança de página, a busca global deve voltar vazia.
    setSearchQuery('');
    setCommandSearchQuery('');
    setDesktopSearchInteracted(false);
    setCommandSearchInteracted(false);
    setDesktopSearchFocused(false);
    setCommandSearchFocused(false);
    setDesktopSearchArmed(false);
    setCommandSearchArmed(false);
    setPopoverOpen(false);
    setCommandDialogOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Hardening: se algum autofill injetar e-mail sem foco/interação, limpamos imediatamente.
    const userEmail = (user?.email || '').trim().toLowerCase();
    if (!userEmail) return;
    if (!desktopSearchFocused && !desktopSearchInteracted && searchQuery.trim().toLowerCase() === userEmail) {
      setSearchQuery('');
    }
    if (!commandSearchFocused && !commandSearchInteracted && commandSearchQuery.trim().toLowerCase() === userEmail) {
      setCommandSearchQuery('');
    }
  }, [
    user?.email,
    searchQuery,
    commandSearchQuery,
    desktopSearchFocused,
    commandSearchFocused,
    desktopSearchInteracted,
    commandSearchInteracted,
  ]);

  const initials = useMemo(() => {
    const src = profile ?? user;
    const f = (src?.first_name || '').trim().charAt(0);
    const l = (src?.last_name || '').trim().charAt(0);
    const pair = `${f}${l}`.trim();
    if (pair) return pair.toUpperCase();
    const em = (user?.email || '').trim().charAt(0);
    return em ? em.toUpperCase() : 'U';
  }, [profile, user]);

  const displayName = useMemo(() => {
    const src = profile ?? user;
    const name = `${src?.first_name || ''} ${src?.last_name || ''}`.trim();
    if (name) return name;
    return user?.email?.split('@')[0] || 'Usuário';
  }, [profile, user]);

  /** Mesmo contrato que GET /api/auth/me (`avatar_url` no objeto raiz). */
  const headerAvatarSrc = useMemo(() => {
    const raw =
      (profile as { avatar_url?: string | null } | null)?.avatar_url ??
      (user as { avatar_url?: string | null } | null)?.avatar_url;
    if (!raw || !String(raw).trim()) return null;
    try {
      return normalizeCatalogMediaUrlForBrowser(String(raw).trim());
    } catch {
      return String(raw).trim();
    }
  }, [profile, user]);

  const { notifUnread, updatesUnread } = useInAppNotificationBadges();
  useRealtimeEvents();

  const hasClients = useFeatureFlag('clients');
  const hasLeads = useFeatureFlag('leads');
  const hasProposals = useFeatureFlag('proposals');
  const hasContracts = useFeatureFlag('contracts');
  const hasTasks = useFeatureFlag('tasks');
  const hasAgenda = useFeatureFlag('agenda');
  const hasInvoices = useFeatureFlag('invoices');
  const hasExpenses = useFeatureFlag('expenses');
  const hasTickets = useFeatureFlag('tickets');
  const hasProjects = useFeatureFlag('projects');
  const hasProducts = useFeatureFlag('products');
  const hasChat = useFeatureFlag('chat');

  const showCreateInvoice =
    hasInvoices && canView('billing') && hasPermissionKey('billing.create_invoice');
  const showCreateClient = hasClients && canView('clients') && canCreate('clients');
  const showCreateProposal = hasProposals && canView('proposals') && canCreate('proposals');
  const showCreateContract = hasContracts && canView('contracts') && canCreate('contracts');
  const showCreateTask = hasTasks && canView('tasks') && canCreate('tasks');
  const showCreateAppointment = hasAgenda && canView('agenda') && canCreate('agenda');
  const showCreateFinanceTx =
    hasExpenses && canView('finance') && hasPermissionKey('finance.create_expense');
  const showTransfer = showCreateFinanceTx;
  const showCreateMenu =
    showCreateInvoice ||
    showCreateClient ||
    showCreateProposal ||
    showCreateContract ||
    showCreateTask ||
    showCreateAppointment ||
    showCreateFinanceTx;

  const createMenuContent = useMemo(() => {
    /** Itens com contexto da rota actual aparecem primeiro (tier 0), mantendo ordem relativa dentro do grupo. */
    type Row = { tier: number; sort: number; node: React.ReactNode };
    const rows: Row[] = [];
    const onFinance = pathname.startsWith('/finance');

    if (showCreateInvoice) {
      rows.push({
        tier:
          pathname.startsWith('/customer-invoices') || pathname.startsWith('/customer-charges') ? 0 : 1,
        sort: 10,
        node: (
          <DropdownMenuItem
            key="create-invoice"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/customer-invoices/new')}
          >
            <Receipt className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Nova fatura
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateClient) {
      rows.push({
        tier: pathname.startsWith('/clients') ? 0 : 1,
        sort: 20,
        node: (
          <DropdownMenuItem
            key="create-client"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/clients?new=1')}
          >
            <Users className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Novo cliente
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateProposal) {
      rows.push({
        tier: pathname.startsWith('/proposals') ? 0 : 1,
        sort: 30,
        node: (
          <DropdownMenuItem
            key="create-proposal"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/proposals/new')}
          >
            <FileText className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Nova proposta
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateContract) {
      rows.push({
        tier: pathname.startsWith('/contracts') ? 0 : 1,
        sort: 40,
        node: (
          <DropdownMenuItem
            key="create-contract"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/contracts/new')}
          >
            <FileSearch className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Novo contrato
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateTask) {
      rows.push({
        tier: pathname.startsWith('/tasks') ? 0 : 1,
        sort: 50,
        node: (
          <DropdownMenuItem
            key="create-task"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/tasks?new=1')}
          >
            <ClipboardCheck className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Nova tarefa
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateAppointment) {
      rows.push({
        tier: pathname.startsWith('/agenda') ? 0 : 1,
        sort: 52,
        node: (
          <DropdownMenuItem
            key="create-appointment"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/agenda?new=1')}
          >
            <CalendarDays className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Novo compromisso
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateFinanceTx) {
      rows.push({
        tier: onFinance ? 0 : 1,
        sort: 60,
        node: (
          <DropdownMenuItem
            key="create-income"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/finance/transactions?new=income')}
          >
            <TrendingUp className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Lançar entrada
          </DropdownMenuItem>
        ),
      });
      rows.push({
        tier: onFinance ? 0 : 1,
        sort: 61,
        node: (
          <DropdownMenuItem
            key="create-expense"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/finance/transactions?new=expense')}
          >
            <TrendingDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Lançar despesa
          </DropdownMenuItem>
        ),
      });
    }
    if (showTransfer) {
      rows.push({
        tier: onFinance ? 0 : 1,
        sort: 80,
        node: (
          <DropdownMenuItem
            key="create-transfer"
            className={CREATE_MENU_ITEM_CLASS}
            onClick={() => navigate('/finance/accounts?transfer=1')}
          >
            <ArrowLeftRight className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Transferir
          </DropdownMenuItem>
        ),
      });
    }

    rows.sort((a, b) => a.tier - b.tier || a.sort - b.sort);
    return rows.map((r) => r.node);
  }, [
    pathname,
    navigate,
    showCreateInvoice,
    showCreateClient,
    showCreateProposal,
    showCreateContract,
    showCreateTask,
    showCreateAppointment,
    showCreateFinanceTx,
    showTransfer,
  ]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandDialogOpen(true);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const searchTypesCsv = useMemo(() => {
    const parts: string[] = [];
    if (hasClients && canView('clients')) parts.push('clients');
    if (hasLeads && canView('leads')) parts.push('leads');
    if (hasInvoices && canView('billing')) parts.push('invoices');
    if (hasProposals && canView('proposals')) parts.push('proposals');
    if (hasContracts && canView('contracts')) parts.push('contracts');
    if (hasTickets && canView('tickets')) parts.push('tickets');
    if (hasProjects && canView('projects')) parts.push('projects');
    if (hasProducts && canView('products')) parts.push('products');
    return parts.join(',');
  }, [
    hasClients,
    hasLeads,
    hasInvoices,
    hasProposals,
    hasContracts,
    hasTickets,
    hasProjects,
    hasProducts,
    canView,
  ]);

  const searchVisibility: GlobalSearchVisibility = useMemo(
    () => ({
      clients: hasClients && canView('clients'),
      leads: hasLeads && canView('leads'),
      invoices: hasInvoices && canView('billing'),
      proposals: hasProposals && canView('proposals'),
      contracts: hasContracts && canView('contracts'),
      tickets: hasTickets && canView('tickets'),
      projects: hasProjects && canView('projects'),
      products: hasProducts && canView('products'),
    }),
    [
      hasClients,
      hasLeads,
      hasInvoices,
      hasProposals,
      hasContracts,
      hasTickets,
      hasProjects,
      hasProducts,
      canView,
    ],
  );

  const canChatClients = hasChat && canView('chat');
  const canChatLeads = hasChat && canView('chat');
  const canNewInvoiceFromClient = hasInvoices && canView('billing') && canCreate('billing');
  const canCreateClientFromSearch = hasClients && canView('clients') && canCreate('clients');

  const activeSearchQuery = commandDialogOpen
    ? (commandSearchArmed && commandSearchInteracted ? commandSearchQuery : '')
    : (desktopSearchArmed && desktopSearchInteracted ? searchQuery : '');
  const qTrim = activeSearchQuery.trim();

  const { groupedSearch, searchLoading, searchError } = useDebouncedGlobalGroupedSearch(
    activeSearchQuery,
    searchTypesCsv,
  );

  useEffect(() => {
    if (!searchTypesCsv) {
      setPopoverOpen(false);
      return;
    }
    if (qTrim.length < 2) {
      if (!commandDialogOpen) setPopoverOpen(false);
      return;
    }
    if (!commandDialogOpen) {
    setPopoverOpen(true);
    }
  }, [searchTypesCsv, qTrim, commandDialogOpen]);

  const panelQuery = activeSearchQuery;

  const handleOpenHref = (href: string) => {
    setPopoverOpen(false);
    setCommandDialogOpen(false);
    setSearchQuery('');
    setCommandSearchQuery('');
    navigate(href);
  };

  const handleChatClient = (clientId: string) => {
    setPopoverOpen(false);
    setCommandDialogOpen(false);
    setSearchQuery('');
    setCommandSearchQuery('');
    void floatingChatCtx.openChatForClient(clientId);
  };

  const handleChatLead = (leadId: string) => {
    setPopoverOpen(false);
    setCommandDialogOpen(false);
    setSearchQuery('');
    setCommandSearchQuery('');
    void floatingChatCtx.openChatForLead(leadId);
  };

  const handleNewInvoiceClient = (clientId: string) => {
    setPopoverOpen(false);
    setCommandDialogOpen(false);
    setSearchQuery('');
    setCommandSearchQuery('');
    navigate(`/customer-invoices/new?client_id=${encodeURIComponent(clientId)}`);
  };

  const handleCreateClientFromSearch = () => {
    handleOpenHref('/clients?new=1');
  };

  return (
    <header
      className={cn(
        'relative z-[5] flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-background/95 px-4 pt-[env(safe-area-inset-top,0px)] shadow-sm backdrop-blur-sm',
        !showMobileGlobalHeader && 'max-md:hidden',
      )}
    >
      <div className="flex min-w-0 max-w-2xl flex-1 items-center lg:max-w-xl">
        <Button
          variant="outline"
          size="icon"
          className="mr-2 shrink-0 md:hidden"
          onClick={() => setCommandDialogOpen(true)}
          aria-label="Buscar"
        >
          <Search className="h-4 w-4" />
        </Button>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <div className="relative hidden w-full md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar clientes, contratos, produtos..."
                value={searchQuery}
                onChange={(e) => {
                  if (!desktopSearchFocused || !desktopSearchArmed) return;
                  setDesktopSearchInteracted(true);
                  setSearchQuery(e.target.value);
                }}
                onPaste={() => {
                  if (!desktopSearchArmed) return;
                  setDesktopSearchInteracted(true);
                }}
                onFocus={() => setDesktopSearchFocused(true)}
                onBlur={() => setDesktopSearchFocused(false)}
                onMouseDown={() => setDesktopSearchArmed(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') return;
                  if (!desktopSearchArmed) setDesktopSearchArmed(true);
                  if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                    setDesktopSearchInteracted(true);
                  }
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setPopoverOpen(false);
                  }
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                name="global-search-input"
                className="pl-9 pr-16"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[min(36rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] border-border/80 p-0 shadow-lg"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false} className="rounded-lg bg-popover">
              <GlobalSearchPanelContent
                layout="popover"
                grouped={groupedSearch}
                loading={searchLoading}
                query={panelQuery}
                visibility={searchVisibility}
                searchError={searchError}
                onOpenHref={handleOpenHref}
                onChatClient={canChatClients ? handleChatClient : undefined}
                onChatLead={canChatLeads ? handleChatLead : undefined}
                onNewInvoiceClient={canNewInvoiceFromClient ? handleNewInvoiceClient : undefined}
                onCreateClient={canCreateClientFromSearch ? handleCreateClientFromSearch : undefined}
              />
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <CommandDialog
        open={commandDialogOpen}
        onOpenChange={(open) => {
          setCommandDialogOpen(open);
          if (open) {
            // Evita reaproveitar/autofill de valor anterior no diálogo.
            setCommandSearchQuery('');
            setCommandSearchInteracted(false);
            setCommandSearchFocused(false);
            setCommandSearchArmed(false);
          }
        }}
      >
        <CommandInput 
          placeholder="Digite para buscar (mín. 2 caracteres)…"
          value={commandSearchQuery}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          name="global-search-command-input"
          onFocus={() => setCommandSearchFocused(true)}
          onBlur={() => setCommandSearchFocused(false)}
          onMouseDown={() => setCommandSearchArmed(true)}
          onKeyDown={() => setCommandSearchArmed(true)}
          onValueChange={(v) => {
            // Só considera interação real quando o diálogo está aberto e com foco explícito do usuário.
            if (!commandDialogOpen || !commandSearchFocused || !commandSearchArmed) return;
            setCommandSearchInteracted(true);
            setCommandSearchQuery(v);
          }}
        />
        <GlobalSearchPanelContent
          layout="dialog"
          grouped={groupedSearch}
          loading={searchLoading}
          query={panelQuery}
          visibility={searchVisibility}
          searchError={searchError}
          onOpenHref={handleOpenHref}
          onChatClient={canChatClients ? handleChatClient : undefined}
          onChatLead={canChatLeads ? handleChatLead : undefined}
          onNewInvoiceClient={canNewInvoiceFromClient ? handleNewInvoiceClient : undefined}
          onCreateClient={canCreateClientFromSearch ? handleCreateClientFromSearch : undefined}
        />
      </CommandDialog>
      
      <div className="flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1">
        {showCreateMenu ? (
        <DropdownMenu>
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="hidden h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground md:inline-flex"
                    aria-label="Criar novo"
                  >
                    <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden />
            </Button>
          </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end" className="text-xs font-medium">
                Criar novo
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="min-w-[13.75rem] rounded-xl border-border/50 bg-popover/95 p-1 shadow-md backdrop-blur-sm dark:bg-popover"
            >
              {createMenuContent}
          </DropdownMenuContent>
        </DropdownMenu>
        ) : null}
        <ThemeToggle />
        <HeaderNotificationBell unreadCount={notifUnread} />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 max-w-[min(100%,14rem)] gap-2 rounded-lg px-2 hover:bg-accent/80">
              <Avatar className="h-8 w-8 shrink-0">
                {headerAvatarSrc ? (
                  <AvatarImage src={headerAvatarSrc} alt="" className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-crm-primary font-medium text-xs text-white">
                  {initials || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 truncate font-medium md:inline">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-xl border-border/60 p-1 shadow-md">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
              {user?.email ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
              ) : null}
            </div>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => navigate('/profile')}>
              <User className="mr-2 h-4 w-4 shrink-0" />
              <span>Perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-lg gap-2" onClick={() => navigate('/updates')}>
              <Newspaper className="mr-2 h-4 w-4 shrink-0" />
              <span className="flex-1">Atualizações</span>
              {updatesUnread > 0 ? (
                <span className="flex shrink-0 items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Novidades não lidas" aria-hidden />
                  <Badge
                    variant="secondary"
                    className="h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px] font-medium tabular-nums"
                  >
                    {updatesUnread > 99 ? '99+' : updatesUnread}
                  </Badge>
                </span>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => navigate('/settings')}>
              <Settings className="mr-2 h-4 w-4 shrink-0" />
              <span>Configurações</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => navigate('/suporte')}>
              <LifeBuoy className="mr-2 h-4 w-4 shrink-0" />
              <span>Suporte</span>
            </DropdownMenuItem>
            {user?.can_manage_plan && canView('meu_plano') && (
              <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => navigate('/meu-plano')}>
                <CreditCard className="mr-2 h-4 w-4 shrink-0" />
                <span>Planos</span>
              </DropdownMenuItem>
            )}
            {user?.is_super_admin && (
              <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => navigate('/superadmin')}>
                <ShieldCheck className="mr-2 h-4 w-4 shrink-0" />
                <span>Super Admin</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem className="cursor-pointer rounded-lg text-destructive focus:text-destructive" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4 shrink-0" />
              <span>Sair</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

/** Coluna direita: header + área principal (provider envolve os dois para o header ler o contexto). */
function AppLayoutMainColumn({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Header />
      <AppMainColumn>{children}</AppMainColumn>
    </div>
  );
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <TenantBrandProvider>
      <FloatingChatProvider>
        <SidebarProvider
          className="min-w-0"
          style={
            {
              // Largura do painel e do espaçador: mais estreita e alinhada (evita trigger a “puxar” a largura).
              '--sidebar-width': '13.5rem',
              '--sidebar-width-icon': '3.25rem',
            } as React.CSSProperties
          }
        >
          <div className="flex min-h-[100dvh] min-h-screen w-full min-w-0">
            <div className="hidden md:block">
              <Nav />
            </div>
            <MobileShellChromeProvider>
              <AppLayoutMainColumn>{children}</AppLayoutMainColumn>
            </MobileShellChromeProvider>
            <FloatingChatWidget />
          </div>
        </SidebarProvider>
      </FloatingChatProvider>
    </TenantBrandProvider>
  );
};

export default AppLayout;
