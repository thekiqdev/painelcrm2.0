import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, List, Calendar, FileText, FileSearch, Settings, UserPlus,
  ClipboardCheck, MessageSquare, LayoutTemplate, Ticket, CreditCard, LayoutGrid, Store,
  Package, ShoppingCart, CalendarSync, Landmark, Receipt, PieChart, ArrowLeftRight, Tags,
  ClipboardList, CalendarDays, Workflow, type LucideIcon,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { TenantSidebarMark } from '@/components/tenant/TenantMarks';
import { routePreload } from '@/routePreload';
import {
  prefetchClientsListNav, prefetchDashboardOverview, prefetchChatWarm,
  prefetchLeadsListNav, prefetchTasksSummaryNav,
} from '@/lib/prefetchAppData';
import { scheduleIdleChatPrefetch } from '@/lib/chatPrefetch';
import { cn } from '@/lib/utils';
import { useSharedChatNavUnreadCount } from '@/hooks/chatNavUnreadContext';
import { useTicketMenuCount } from '@/hooks/useTicketMenuCount';
import { formatUnseenCount, useLeadUnseenCount } from '@/hooks/useLeadUnseenCount';
import { useTranslation } from 'react-i18next';

const SidebarNavLinkItem = React.memo(function SidebarNavLinkItem({
  to,
  end,
  icon: Icon,
  label,
  preload,
  excludeActiveWhenPathStartsWith,
  collapsed,
  badge,
}: {
  to: string;
  end?: boolean;
  icon: LucideIcon;
  label: string;
  preload?: () => void;
  /** Evita match por prefixo (ex.: `/finance/accounts` vs `/finance/accounts-payable`). */
  excludeActiveWhenPathStartsWith?: string;
  collapsed: boolean;
  badge?: string | null;
}) {
  const { pathname } = useLocation();
  const excluded =
    Boolean(excludeActiveWhenPathStartsWith) && pathname.startsWith(excludeActiveWhenPathStartsWith!);
  const navLinkClassFn = (isActive: boolean) =>
    cn(
      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
      isActive
        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm'
        : 'text-sidebar-foreground/90 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground',
    );
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={label}>
        <NavLink
          to={to}
          end={end}
          onMouseEnter={preload}
          className={({ isActive }) =>
            cn(navLinkClassFn(isActive && !excluded), 'relative overflow-visible', badge && 'gap-2')
          }
        >
          <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
          {!collapsed ? (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="truncate">{label}</span>
              {badge ? (
                <span className="flex h-5 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold tabular-nums leading-none text-white">
                  {badge}
                </span>
              ) : null}
            </span>
          ) : badge ? (
            <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold tabular-nums leading-none text-white">
              {badge}
            </span>
          ) : null}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});

export const AppShellSidebar = React.memo(function AppShellSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useTranslation('nav');
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
  const hasChatbotFlows = useFeatureFlag('chatbot_flows');
  const hasProposals = useFeatureFlag('proposals');
  const hasServiceOrders = useFeatureFlag('service_orders');
  const hasContracts = useFeatureFlag('contracts');
  const hasInvoices = useFeatureFlag('invoices');
  const hasExpenses = useFeatureFlag('expenses');
  const hasSettings = useFeatureFlag('settings');

  useEffect(() => {
    const runPrefetch = () => {
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
    };
    let cancelled = false;
    const safeRun = () => {
      if (!cancelled) runPrefetch();
    };
    const idleId =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(safeRun, { timeout: 3000 })
        : null;
    const timeoutId = idleId == null ? window.setTimeout(safeRun, 2000) : null;
    return () => {
      cancelled = true;
      if (idleId != null && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
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
  const unseenLeads = useLeadUnseenCount(show(hasLeads, 'leads'));
  const unseenLeadsLabel = formatUnseenCount(unseenLeads);

  const navLinkClassFn = (isActive: boolean) =>
    cn(
      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
      isActive
        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm'
        : 'text-sidebar-foreground/90 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground',
    );

  function ChatSidebarNavItem() {
    const chatAllowed = show(hasChat, 'chat');
    const unread = useSharedChatNavUnreadCount();
    const badgeLabel =
      unread <= 0 ? null : unread > 99 ? '99+' : unread > 9 ? '9+' : String(unread);

    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={t('chat')}>
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
                <span className="truncate">{t('chat')}</span>
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
        <SidebarMenuButton asChild tooltip={t('tickets')}>
          <NavLink
            to="/support/tickets"
            onMouseEnter={() => routePreload.tickets()}
            className={({ isActive }) => cn(navLinkClassFn(isActive), 'relative', badgeLabel && 'gap-2')}
          >
            <Ticket className="size-4 shrink-0 opacity-90" aria-hidden />
            {!collapsed ? (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">{t('tickets')}</span>
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
                aria-label={t('toggle_menu')}
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
              aria-label={t('toggle_menu')}
            />
          </>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0.5">
        <SidebarGroup className="py-1.5">
          <SidebarMenu className="gap-0.5">
            {show(hasDashboard, 'dashboard') && (
              <SidebarNavLinkItem
                to="/dashboard"
                icon={LayoutDashboard}
                label={t('dashboard')}
                preload={() => {
                  routePreload.dashboard();
                  prefetchDashboardOverview(
                    tenantId,
                    userId,
                    show(hasDashboard, 'dashboard'),
                  );
                }}
                collapsed={collapsed}
              />
            )}
          </SidebarMenu>
        </SidebarGroup>
        
        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            {t('g_relationship')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasClients, 'clients') && (
                <SidebarNavLinkItem
                  to="/clients"
                  icon={Users}
                  label={t('clients')}
                  preload={() => {
                    routePreload.clients();
                    prefetchClientsListNav(
                      tenantId,
                      userId,
                      show(hasClients, 'clients') && hasPermissionKey('clients.view'),
                    );
                  }}
                  collapsed={collapsed}
                />
              )}
              {show(hasLeads, 'leads') && (
                <SidebarNavLinkItem
                  to="/leads"
                  icon={UserPlus}
                  label={t('leads')}
                  preload={() => {
                    routePreload.leads();
                    prefetchLeadsListNav(
                      tenantId,
                      userId,
                      show(hasLeads, 'leads') && hasPermissionKey('leads.view'),
                    );
                  }}
                  collapsed={collapsed}
                  badge={unseenLeadsLabel}
                />
              )}
              {show(hasAgenda, 'agenda') && (
                <SidebarNavLinkItem to="/agenda" icon={CalendarDays} label={t('agenda')} preload={() => routePreload.agenda()} collapsed={collapsed} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            {t('g_service')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasChat, 'chat') && <ChatSidebarNavItem />}
              {show(hasChat, 'chat') && (
                <SidebarNavLinkItem to="/chat/kanbam" icon={LayoutGrid} label={t('kanban')} preload={() => routePreload.chatKanban()} collapsed={collapsed} />
              )}
              {show(hasTickets, 'tickets') && (
                <TicketSidebarNavItem />
              )}
              {show(hasChatbotFlows, 'chatbot_flows') && (
                <SidebarNavLinkItem
                  to="/chatbot-flows"
                  icon={Workflow}
                  label={t('chatbot')}
                  preload={() => routePreload.chatbotFlows()}
                  collapsed={collapsed}
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {show(hasInvoices, 'billing') &&
        (hasPermissionKey('billing.view_invoices') ||
          hasPermissionKey('billing.view_subscriptions')) ? (
          <SidebarGroup className="py-1.5">
            <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
              {t('g_billing')}
            </SidebarGroupLabel>
          <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {hasPermissionKey('billing.view_invoices') ? (
                <SidebarNavLinkItem
                  to="/customer-invoices"
                  icon={FileText}
                  label={t('invoices')}
                  preload={() => routePreload.customerInvoices()} collapsed={collapsed} />
                ) : null}
                {hasPermissionKey('billing.view_subscriptions') ? (
                <SidebarNavLinkItem
                  to="/crm-subscriptions"
                  icon={CalendarSync}
                  label={t('subscriptions')}
                  preload={() => routePreload.crmSubscriptions()} collapsed={collapsed} />
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            {t('g_docs')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasProposals, 'proposals') && (
                <SidebarNavLinkItem to="/proposals" icon={FileText} label={t('proposals')} preload={() => routePreload.proposals()} collapsed={collapsed} />
              )}
              {show(hasServiceOrders, 'service_orders') && (
                <SidebarNavLinkItem
                  to="/service-orders"
                  icon={ClipboardList}
                  label={t('service_orders')}
                  preload={() => routePreload.serviceOrders()}
                  collapsed={collapsed}
                />
              )}
              {show(hasContracts, 'contracts') && (
                <SidebarNavLinkItem to="/contracts" icon={FileSearch} label={t('contracts')} preload={() => routePreload.contracts()} collapsed={collapsed} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            {t('g_projects')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasProjects, 'projects') && (
                <SidebarNavLinkItem to="/projects" icon={Calendar} label={t('projects')} preload={() => routePreload.projects()} collapsed={collapsed} />
              )}
              {show(hasTasks, 'tasks') && (
                <SidebarNavLinkItem
                  to="/tasks"
                  icon={ClipboardCheck}
                  label={t('tasks')}
                  preload={() => {
                    routePreload.tasks();
                    prefetchTasksSummaryNav(tenantId, userId);
                  }} collapsed={collapsed} />
              )}
              {show(hasTasks, 'project_templates') && (
                <SidebarNavLinkItem
                  to="/project-templates"
                  icon={LayoutTemplate}
                  label={t('templates')}
                  preload={() => routePreload.projectTemplates()} collapsed={collapsed} />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {show(hasFunnels, 'funnels') && (
          <SidebarGroup className="py-1.5">
            <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
              {t('g_sales')}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <SidebarNavLinkItem to="/funnel" icon={List} label={t('funnel')} preload={() => routePreload.funnel()} collapsed={collapsed} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            {t('g_store')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {show(hasProducts, 'products') && (
                <>
                  <SidebarNavLinkItem to="/admin/products" icon={Package} label={t('catalog')} preload={() => routePreload.products()} collapsed={collapsed} />
                  <SidebarNavLinkItem to="/orders" icon={ShoppingCart} label={t('orders')} preload={() => routePreload.orders()} collapsed={collapsed} />
                  <SidebarNavLinkItem to="/admin/loja" icon={Store} label={t('store_settings')} preload={() => routePreload.storeSettings()} collapsed={collapsed} />
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
            {t('g_finance')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
                <>
                  {hasPermissionKey('finance.view') ? (
                  <SidebarNavLinkItem to="/finance" end icon={LayoutDashboard} label={t('finance_summary')} preload={() => routePreload.finance()} collapsed={collapsed} />
                  ) : null}
                  {hasPermissionKey('finance.view') ? (
                  <SidebarNavLinkItem
                    to="/finance/accounts"
                    icon={Landmark}
                    label={t('banks')}
                    excludeActiveWhenPathStartsWith="/finance/accounts-payable"
                    preload={() => routePreload.finance()} collapsed={collapsed} />
                  ) : null}
                  {hasPermissionKey('finance.view_revenue') || hasPermissionKey('finance.view_expenses') ? (
                  <SidebarNavLinkItem
                    to="/finance/transactions"
                    icon={ArrowLeftRight}
                    label={t('cashflow')}
                    preload={() => routePreload.finance()} collapsed={collapsed} />
                  ) : null}
                  {hasPermissionKey('finance.view_accounts_payable') ? (
                  <SidebarNavLinkItem
                    to="/finance/accounts-payable"
                    icon={ClipboardList}
                    label={t('payables')}
                    preload={() => routePreload.finance()} collapsed={collapsed} />
                  ) : null}
                  {hasPermissionKey('finance.view') ? (
                  <SidebarNavLinkItem
                    to="/finance/credit-cards"
                    icon={CreditCard}
                    label={t('credit_cards')}
                    preload={() => routePreload.finance()} collapsed={collapsed} />
                  ) : null}
                  {hasPermissionKey('finance.view_expenses') ? (
                  <SidebarNavLinkItem to="/finance/categories" icon={Tags} label={t('categories')} preload={() => routePreload.finance()} collapsed={collapsed} />
                  ) : null}
                  {hasPermissionKey('finance.view_reports') ? (
                  <SidebarNavLinkItem to="/finance/relatorios" icon={PieChart} label={t('reports')} preload={() => routePreload.finance()} collapsed={collapsed} />
                  ) : null}
                </>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ) : null}
        
        <SidebarGroup className="py-1.5">
          <SidebarGroupLabel className={cn('px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50', collapsed && 'sr-only')}>
            {t('g_settings')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
            {show(hasSettings, 'settings') && (
                <SidebarNavLinkItem to="/settings" icon={Settings} label={t('settings')} preload={() => routePreload.settings()} collapsed={collapsed} />
            )}
          </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
});
