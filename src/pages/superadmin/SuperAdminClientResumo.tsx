import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTenantDetail } from '@/contexts/TenantDetailContext';
import { ExternalLink, UserCheck, UserX } from 'lucide-react';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  suspended: 'Desativado',
  trial: 'Trial',
};

export default function SuperAdminClientResumo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenant, refresh } = useTenantDetail();
  const [saving, setSaving] = React.useState(false);

  const setStatus = async (status: string) => {
    if (!id) return;
    setSaving(true);
    const res = await apiClient.put(`/api/superadmin/tenants/${id}`, { status });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(status === 'active' ? 'Conta ativada.' : status === 'suspended' ? 'Conta desativada.' : 'Status atualizado.');
    refresh();
  };

  const clientUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname.replace(/\/superadmin.*/, '')}`
    : '';

  if (!tenant) return null;

  const createdDate = tenant.created_at
    ? new Date(tenant.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Resumo</h2>
        <p className="text-sm text-muted-foreground">Visão geral e ações rápidas da empresa.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nome</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{tenant.name}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{statusLabels[tenant.status] || tenant.status}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Plano atual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{tenant.plan_name || tenant.plan_slug || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Telefone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{tenant.billing_phone?.trim() || '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Editar em Configurações → Contato principal</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Data de criação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{createdDate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Próxima cobrança</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-muted-foreground">—</p>
            <p className="text-xs text-muted-foreground">Disponível na aba Faturamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{tenant.users_count ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ações rápidas</CardTitle>
          <CardDescription>Ativar ou suspender a conta; acessar o sistema como cliente.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {clientUrl && (
            <Button asChild>
              <a href={clientUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Acessar sistema do cliente
              </a>
            </Button>
          )}
          {tenant.status !== 'active' && (
            <Button variant="secondary" onClick={() => setStatus('active')} disabled={saving}>
              <UserCheck className="mr-2 h-4 w-4" />
              Ativar conta
            </Button>
          )}
          {tenant.status !== 'suspended' && (
            <Button variant="outline" onClick={() => setStatus('suspended')} disabled={saving}>
              <UserX className="mr-2 h-4 w-4" />
              Suspender conta
            </Button>
          )}
          <Button variant="ghost" onClick={() => navigate(`/superadmin/clients/${id}/configuracoes`)}>
            Trocar plano
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
