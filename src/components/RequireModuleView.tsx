import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';

/** Mapeia pathname para moduleId (ordem: mais específico primeiro). */
function pathToModule(pathname: string): string | null {
  if (pathname.startsWith('/project-templates')) return 'project_templates';
  if (pathname.startsWith('/support/tickets')) return 'tickets';
  if (pathname.startsWith('/meu-plano')) return 'meu_plano';
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

export function RequireModuleView({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { canView, loading } = useModulePermissions();
  const moduleId = pathToModule(location.pathname);

  if (loading || !moduleId) {
    return <>{children}</>;
  }

  if (!canView(moduleId)) {
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
