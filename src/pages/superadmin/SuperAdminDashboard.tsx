import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/integrations/api/client';
import { LayoutDashboard, Package, Users, UserCheck, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardData {
  totals: {
    plans: number;
    tenants: number;
    active_tenants: number;
    users: number;
  };
  recent_tenants: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    plan_name: string;
  }>;
  recent_users: Array<{
    id: string;
    email: string;
    created_at: string;
    tenant_name: string | null;
  }>;
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<DashboardData>('/api/superadmin/dashboard');
      if (res.error) {
        setError(res.error);
        setData(null);
      } else if (res.data) {
        setData(res.data);
      }
      setLoading(false);
    };
    load();
  }, []);

  const formatDate = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Super Admin</h1>
          <p className="text-muted-foreground">Visão geral de planos, empresas e usuários.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard Super Admin</h1>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  const t = data?.totals ?? { plans: 0, tenants: 0, active_tenants: 0, users: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Super Admin</h1>
        <p className="text-muted-foreground">Visão geral de planos, clientes e usuários.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Planos</CardTitle>
              <CardDescription>Cadastrados</CardDescription>
            </div>
            <Package className="h-8 w-8 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{t.plans}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Empresas</CardTitle>
              <CardDescription>Total de tenants</CardDescription>
            </div>
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{t.tenants}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Empresas ativas</CardTitle>
              <CardDescription>Status ativo</CardDescription>
            </div>
            <Users className="h-8 w-8 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{t.active_tenants}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Usuários</CardTitle>
              <CardDescription>Total no sistema</CardDescription>
            </div>
            <UserCheck className="h-8 w-8 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{t.users}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimas empresas</CardTitle>
              <CardDescription>Cadastros recentes de empresas.</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.recent_tenants?.length ? (
              <ul className="space-y-3">
                {data.recent_tenants.map((row) => (
                  <li key={row.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                    <div>
                      <span className="font-medium">{row.name}</span>
                      <span className="text-muted-foreground ml-2">({row.slug})</span>
                    </div>
                    <span className="text-muted-foreground">{formatDate(row.created_at)} · {row.plan_name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma empresa cadastrada.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Últimos usuários</CardTitle>
            <CardDescription>Cadastros recentes de usuários.</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.recent_users?.length ? (
              <ul className="space-y-3">
                {data.recent_users.map((row) => (
                  <li key={row.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                    <span className="font-medium">{row.email}</span>
                    <span className="text-muted-foreground">{formatDate(row.created_at)}{row.tenant_name ? ` · ${row.tenant_name}` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhum usuário cadastrado.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
