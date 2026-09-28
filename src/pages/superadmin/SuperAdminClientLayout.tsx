import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Settings,
  Flag,
  BarChart3,
  BadgePercent,
  MessageSquare,
  ScrollText,
  ArrowLeft,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { TenantDetailProvider, useTenantDetail } from '@/contexts/TenantDetailContext';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { useSuperadminImpersonation } from '@/hooks/useSuperadminImpersonation';

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  suspended: 'Desativado',
  trial: 'Trial',
};

const navItems = [
  { to: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { to: 'faturamento', label: 'Faturamento', icon: CreditCard },
  { to: 'usuarios', label: 'Usuários', icon: Users },
  { to: 'configuracoes', label: 'Configurações', icon: Settings },
  { to: 'recursos', label: 'Recursos', icon: Flag },
  { to: 'limites', label: 'Limites', icon: BarChart3 },
  { to: 'comercial', label: 'Comercial', icon: BadgePercent },
  { to: 'observacoes', label: 'Observações', icon: MessageSquare },
  { to: 'logs', label: 'Logs', icon: ScrollText },
];

function ClientLayoutInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenant, setTenant, loading, error, refresh } = useTenantDetail();
  const [plans, setPlans] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [savingStatus, setSavingStatus] = useState(false);
  const { openAsTenantPrimaryUser, impersonatingTenantId } = useSuperadminImpersonation();

  React.useEffect(() => {
    apiClient.get<{ id: string; name: string; slug: string }[]>('/api/superadmin/plans').then((r) => {
      if (r.data) setPlans(r.data);
    });
  }, []);

  const setStatus = async (status: string) => {
    if (!id) return;
    setSavingStatus(true);
    const res = await apiClient.put(`/api/superadmin/tenants/${id}`, { status });
    setSavingStatus(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data && tenant) setTenant({ ...tenant, status });
    toast.success(status === 'active' ? 'Conta ativada.' : status === 'suspended' ? 'Conta desativada.' : 'Status atualizado.');
    refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-destructive">Empresa não encontrada ou erro ao carregar.</p>
        <Button variant="outline" onClick={() => navigate('/superadmin/clients')}>
          Voltar para Empresas
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-card shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/superadmin/clients')} title="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{tenant.name}</h1>
                <Badge
                  variant={tenant.status === 'active' ? 'default' : tenant.status === 'trial' ? 'secondary' : 'destructive'}
                >
                  {statusLabels[tenant.status] || tenant.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">Painel administrativo da empresa</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => id && openAsTenantPrimaryUser(id)}
              disabled={!id || impersonatingTenantId === id}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {impersonatingTenantId === id ? 'Abrindo...' : 'Acessar sistema do cliente'}
            </Button>
            <Select
              value={tenant.status}
              onValueChange={setStatus}
              disabled={savingStatus}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativar</SelectItem>
                <SelectItem value="suspended">Suspender</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/superadmin/clients/${id}/configuracoes`)}>
              Trocar plano
            </Button>
          </div>
        </div>
        {tenant.account_type === 'customer_tenant' && tenant.partner_id ? (
          <div className="border-t bg-muted/40 px-4 py-2 text-sm">
            Cliente do canal Partner. Cobrança e carteira são do Partner —{' '}
            <Link
              className="font-medium text-foreground underline underline-offset-2"
              to={`/superadmin/partners/${tenant.partner_id}`}
            >
              abrir ficha do Partner
            </Link>
            . Esta tela permanece para suporte (acesso pleno).
          </div>
        ) : null}
        {tenant.account_type === 'partner' ? (
          <div className="border-t bg-muted/40 px-4 py-2 text-sm">
            Este tenant é a agência Partner, não um cliente SaaS.{' '}
            <Link
              className="font-medium text-foreground underline underline-offset-2"
              to={`/superadmin/partners/${tenant.id}`}
            >
              Abrir Partners
            </Link>
            .
          </div>
        ) : null}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 border-r bg-muted/30 shrink-0 flex flex-col">
          <nav className="p-2 space-y-0.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={`/superadmin/clients/${id}/${to}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-crm-primary/10 text-crm-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function SuperAdminClientLayout() {
  const { id } = useParams<{ id: string }>();

  return (
    <TenantDetailProvider tenantId={id ?? null}>
      <ClientLayoutInner />
    </TenantDetailProvider>
  );
}
