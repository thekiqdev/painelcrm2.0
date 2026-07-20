import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import type { PermissionCatalogKey } from '@/permissions/permissionCatalog';

/** Mapeia pathname para moduleId (ordem: mais específico primeiro). */
function pathToModule(pathname: string): string | null {
  if (pathname.startsWith('/project-templates')) return 'project_templates';
  if (pathname.startsWith('/support/tickets')) return 'tickets';
  if (pathname.startsWith('/meu-plano') || pathname === '/plano' || pathname === '/planos') return 'meu_plano';
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return 'dashboard';
  if (pathname.startsWith('/clients')) return 'clients';
  if (pathname.startsWith('/leads')) return 'leads';
  if (pathname.startsWith('/funnel')) return 'funnels';
  if (pathname.startsWith('/admin/loja')) return 'products';
  if (pathname.startsWith('/admin/products')) return 'products';
  if (pathname.startsWith('/products')) return 'products';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/tasks')) return 'tasks';
  if (pathname.startsWith('/agenda')) return 'agenda';
  if (pathname.startsWith('/chat')) return 'chat';
  if (pathname.startsWith('/proposals')) return 'proposals';
  if (pathname.startsWith('/contracts')) return 'contracts';
  if (pathname.startsWith('/billing')) return 'billing';
  if (pathname.startsWith('/customer-invoices')) return 'billing';
  if (pathname.startsWith('/finance')) return 'finance';
  if (pathname.startsWith('/settings')) return 'settings';
  return null;
}

/** Rotas com chave granular adicional (além de can_view no módulo). */
function catalogKeyForPath(pathname: string): PermissionCatalogKey | null {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (path === '/customer-invoices/new' || path.startsWith('/customer-invoices/new/')) {
    return 'billing.create_invoice';
  }
  if (/\/customer-invoices\/[^/]+\/edit$/.test(path)) {
    return 'billing.edit_invoice';
  }
  if (pathname.startsWith('/customer-invoices')) return 'billing.view_invoices';
  if (pathname.startsWith('/customer-charges')) return 'billing.view_charges';
  if (pathname.startsWith('/crm-subscriptions')) return 'billing.view_subscriptions';
  if (pathname.startsWith('/finance/relatorios') || pathname.startsWith('/finance/relatórios'))
    return 'finance.view_reports';
  if (pathname.startsWith('/finance/accounts-payable')) return 'finance.view_accounts_payable';
  if (pathname.startsWith('/clients')) return 'clients.view';
  if (pathname.startsWith('/leads')) return 'leads.view';
  if (pathname.startsWith('/proposals')) return 'proposals.view';
  if (pathname.startsWith('/contracts')) return 'contracts.view';
  return null;
}

export function RequireModuleView({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { canView, loading, hasPermissionKey } = useModulePermissions();
  const moduleId = pathToModule(location.pathname);
  const extraKey = catalogKeyForPath(location.pathname);

  if (loading || !moduleId) {
    return <>{children}</>;
  }

  if (!canView(moduleId)) {
    return <RedirectNoPermission />;
  }

  if (extraKey && !hasPermissionKey(extraKey)) {
    return <RedirectNoPermission />;
  }

  return <>{children}</>;
}

function RedirectNoPermission() {
  useEffect(() => {
    toast.error('Sem permissão para acessar esta área.');
  }, []);
  return <Navigate to="/dashboard" replace />;
}
