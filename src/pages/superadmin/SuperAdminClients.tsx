import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

interface Plan {
  id: string;
  name: string;
  slug: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  plan_id: string;
  plan_name?: string;
  plan_slug?: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
  users_count?: number;
  created_via?: 'registration' | 'superadmin';
  primary_contact_email?: string | null;
  primary_contact_name?: string | null;
  billing_phone?: string | null;
}

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  suspended: 'Desativado',
  trial: 'Trial',
};

const originLabels: Record<string, string> = {
  registration: 'Cadastro no site',
  superadmin: 'Super Admin',
};

export default function SuperAdminClients() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const loadTenants = async () => {
    setListError(null);
    const res = await apiClient.get<Tenant[]>('/api/superadmin/tenants');
    if (res.error) {
      const msg = res.details?.status === 403 ? 'Sem permissão para listar empresas.' : res.error;
      setListError(msg);
      setTenants([]);
      toast.error(msg);
    } else {
      setTenants(Array.isArray(res.data) ? res.data : []);
    }
  };

  const loadPlans = async () => {
    const res = await apiClient.get<Plan[]>('/api/superadmin/plans');
    if (res.data) setPlans(res.data);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadTenants(), loadPlans()]).finally(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empresas</h1>
          <p className="text-muted-foreground">
            Venda direta (Platform). Clientes de Partner ficam em{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => navigate('/superadmin/partners')}
            >
              Partners
            </button>
            .
          </p>
        </div>
        <Button onClick={() => navigate('/superadmin/clients/new')} disabled={plans.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Nova empresa
        </Button>
      </div>

      {plans.length === 0 && (
        <p className="text-sm text-amber-600">Cadastre pelo menos um plano antes de criar empresas.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de empresas</CardTitle>
          <CardDescription>
            Contas Platform (cadastro no site ou Super Admin). Canal white-label não entra nesta lista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : listError ? (
            <p className="text-destructive">{listError}</p>
          ) : tenants.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma empresa Platform cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Domínio</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trial até</TableHead>
                  <TableHead>Usuários</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow
                    key={tenant.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/superadmin/clients/${tenant.id}`)}
                  >
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.primary_contact_name?.trim() || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.billing_phone?.trim() || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.primary_contact_email || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                    <TableCell>{tenant.domain || '—'}</TableCell>
                    <TableCell>{tenant.plan_name || tenant.plan_slug || tenant.plan_id}</TableCell>
                    <TableCell>
                      <Badge variant={tenant.status === 'active' ? 'default' : tenant.status === 'trial' ? 'secondary' : 'destructive'}>
                        {statusLabels[tenant.status] || tenant.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(tenant.trial_ends_at)}</TableCell>
                    <TableCell>{tenant.users_count ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={tenant.created_via === 'registration' ? 'secondary' : 'outline'}>
                        {originLabels[tenant.created_via ?? 'superadmin'] ?? 'Super Admin'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
