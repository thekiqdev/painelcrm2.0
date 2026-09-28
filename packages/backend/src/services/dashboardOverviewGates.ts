/**
 * Gates de visibilidade para o dashboard executivo (overview).
 * Usado no controller para evitar queries e serialização sem permissão.
 */
import type { ModulePermissionsMap } from '../permissions/permissionTypes.js';
import { hasPermissionKey } from '../permissions/permissionCatalog.js';

export interface DashboardOverviewGates {
  isAdmin: boolean;

  /** Legado: billing.can_view / billing.view */
  canBilling: boolean;
  /** Legado: finance.can_view / finance.view */
  canFinance: boolean;

  canChat: boolean;
  canTasks: boolean;
  canProjects: boolean;
  canLeads: boolean;
  canClients: boolean;
  canTickets: boolean;
  canAgenda: boolean;

  billingView: boolean;
  billingViewInvoices: boolean;
  billingViewSubscriptions: boolean;
  billingViewCharges: boolean;

  financeView: boolean;
  financeViewExpenses: boolean;
  financeViewProfit: boolean;
  financeViewAccountsPayable: boolean;
  financeViewReports: boolean;
  financeViewRevenue: boolean;

  dashboardViewSalesCards: boolean;
  dashboardViewFinancialCards: boolean;
  dashboardViewAttendanceCards: boolean;
  dashboardViewTasksCards: boolean;
  dashboardViewProjectsCards: boolean;
}

function hk(perms: ModulePermissionsMap, key: Parameters<typeof hasPermissionKey>[1], isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return hasPermissionKey(perms, key);
}

export function computeDashboardOverviewGates(
  perms: ModulePermissionsMap,
  isAdmin: boolean
): DashboardOverviewGates {
  const v = (moduleId: string) => isAdmin || perms[moduleId]?.can_view === true;

  return {
    isAdmin,
    canBilling: v('billing'),
    canFinance: v('finance'),
    canChat: v('chat'),
    canTasks: v('tasks'),
    canProjects: v('projects'),
    canLeads: v('leads'),
    canClients: v('clients'),
    canTickets: v('tickets'),
    canAgenda: v('agenda'),

    billingView: hk(perms, 'billing.view', isAdmin),
    billingViewInvoices: hk(perms, 'billing.view_invoices', isAdmin),
    billingViewSubscriptions: hk(perms, 'billing.view_subscriptions', isAdmin),
    billingViewCharges: hk(perms, 'billing.view_charges', isAdmin),

    financeView: hk(perms, 'finance.view', isAdmin),
    financeViewExpenses: hk(perms, 'finance.view_expenses', isAdmin),
    financeViewProfit: hk(perms, 'finance.view_profit', isAdmin),
    financeViewAccountsPayable: hk(perms, 'finance.view_accounts_payable', isAdmin),
    financeViewReports: hk(perms, 'finance.view_reports', isAdmin),
    financeViewRevenue: hk(perms, 'finance.view_revenue', isAdmin),

    dashboardViewSalesCards: hk(perms, 'dashboard.view_sales_cards', isAdmin),
    dashboardViewFinancialCards: hk(perms, 'dashboard.view_financial_cards', isAdmin),
    dashboardViewAttendanceCards: hk(perms, 'dashboard.view_attendance_cards', isAdmin),
    dashboardViewTasksCards: hk(perms, 'dashboard.view_tasks_cards', isAdmin),
    dashboardViewProjectsCards: hk(perms, 'dashboard.view_projects_cards', isAdmin),
  };
}
