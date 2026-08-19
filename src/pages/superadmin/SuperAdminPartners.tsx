import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

type PartnerListItem = {
  id: string;
  name: string;
  slug: string;
  public_name: string;
  product_name: string;
  program_type: string;
  partner_status: string;
  purchased_seats: number;
  used_seats_cache: number;
  unit_cost_cents: number;
  floor_price_cents: number | null;
  admin_email: string | null;
};

export default function SuperAdminPartners() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PartnerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    partners_active: number;
    partners_suspended: number;
    customer_tenants: number;
    platform_customers: number;
    migrated_from_channel: number;
    seats_purchased_total: number;
    seats_used_total: number;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      const [listRes, statsRes] = await Promise.all([
        apiClient.get<PartnerListItem[]>('/api/superadmin/partners'),
        apiClient.get<NonNullable<typeof stats>>('/api/superadmin/partners/channel-stats'),
      ]);
      if (listRes.error) {
        toast.error(listRes.error || 'Falha ao listar partners (flag partner.channel_v1?)');
        setItems([]);
      } else {
        setItems(listRes.data ?? []);
      }
      if (!statsRes.error && statsRes.data) setStats(statsRes.data);
      setLoading(false);
    };
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partners</h1>
          <p className="text-sm text-muted-foreground">
            Canal white-label — criar, alocar licenças e suspender (migração D15).
          </p>
        </div>
        <Button onClick={() => navigate('/superadmin/partners/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Partner
        </Button>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Partners ativos</CardDescription>
              <CardTitle className="text-2xl">{stats.partners_active}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {stats.partners_suspended} suspensos
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Clientes canal</CardDescription>
              <CardTitle className="text-2xl">{stats.customer_tenants}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              vs {stats.platform_customers} venda direta
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Migrados (D15)</CardDescription>
              <CardTitle className="text-2xl">{stats.migrated_from_channel}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              agora platform_customer
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Licenças (pool)</CardDescription>
              <CardTitle className="text-2xl">
                {stats.seats_used_total}/{stats.seats_purchased_total}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">usados / comprados</CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Partners cadastrados
          </CardTitle>
          <CardDescription>
            Canal white-label — criar e alocar pool de licenças (usuários). Ative{' '}
            <Link to="/superadmin/avancado/feature-flags" className="underline underline-offset-2">
              partner.channel_v1
            </Link>{' '}
            em Feature Flags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum Partner ainda.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {items.map((p) => (
                <Link
                  key={p.id}
                  to={`/superadmin/partners/${p.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{p.public_name || p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.slug} · {p.admin_email || 'sem admin'} · {p.product_name}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{p.program_type}</Badge>
                    <Badge variant={p.partner_status === 'active' ? 'default' : 'secondary'}>
                      {p.partner_status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {p.used_seats_cache}/{p.purchased_seats} users
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
