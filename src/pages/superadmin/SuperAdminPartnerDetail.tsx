import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

type PartnerDetail = {
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
  memberships: Array<{
    id: string;
    role: string;
    status: string;
    email: string | null;
  }>;
};

export default function SuperAdminPartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [addSeats, setAddSeats] = useState('5');
  const [saving, setSaving] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [events, setEvents] = useState<
    Array<{
      id: string;
      reason: string | null;
      customers_migrated: number;
      price_overrides_created: number;
      created_at: string;
    }>
  >([]);
  const [customers, setCustomers] = useState<
    Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      admin_email: string | null;
      sell_plan_name: string | null;
      users_count: number;
    }>
  >([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  const reload = async () => {
    if (!id) return;
    const res = await apiClient.get<PartnerDetail>(`/api/superadmin/partners/${id}`);
    if (res.error) {
      toast.error(res.error || 'Partner não encontrado');
      setDetail(null);
      return;
    }
    setDetail(res.data);
    setCustomersLoading(true);
    const [ev, cust] = await Promise.all([
      apiClient.get<typeof events>(`/api/superadmin/partners/${id}/suspension-events`),
      apiClient.get<typeof customers>(`/api/superadmin/partners/${id}/customers`),
    ]);
    if (!ev.error && ev.data) setEvents(ev.data);
    if (cust.error) {
      toast.error(cust.error || 'Falha ao listar clientes do canal');
      setCustomers([]);
    } else {
      setCustomers(Array.isArray(cust.data) ? cust.data : []);
    }
    setCustomersLoading(false);
  };

  useEffect(() => {
    void reload();
  }, [id]);

  const topUp = async () => {
    if (!id) return;
    const n = Number(addSeats);
    if (!Number.isInteger(n) || n < 1) {
      toast.error('Informe um inteiro ≥ 1');
      return;
    }
    setSaving(true);
    const res = await apiClient.patch(`/api/superadmin/partners/${id}`, { add_seats: n });
    setSaving(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao alocar');
      return;
    }
    toast.success(`+${n} licenças alocadas`);
    await reload();
  };

  const suspend = async () => {
    if (!id) return;
    const ok = window.confirm(
      'Suspender este Partner? Clientes do canal migrarão para a Platform mantendo o preço atual (D15).'
    );
    if (!ok) return;
    setSaving(true);
    const res = await apiClient.post<{
      customers_migrated: number;
      price_overrides_created: number;
      error?: string;
    }>(`/api/superadmin/partners/${id}/suspend`, {
      reason: suspendReason.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao suspender');
      return;
    }
    toast.success(
      `Suspenso. Migrados: ${res.data?.customers_migrated ?? 0} · overrides: ${res.data?.price_overrides_created ?? 0}`
    );
    await reload();
  };

  if (!detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/superadmin/partners')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" asChild>
        <Link to="/superadmin/partners">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Partners
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{detail.public_name}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.slug} · {detail.product_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{detail.program_type}</Badge>
          <Badge>{detail.partner_status}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pool de licenças</CardTitle>
          <CardDescription>1 licença = 1 usuário nos clientes do canal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Usados <strong>{detail.used_seats_cache}</strong> / comprados{' '}
            <strong>{detail.purchased_seats}</strong>
            {detail.floor_price_cents != null ? (
              <>
                {' '}
                · piso R$ {(detail.floor_price_cents / 100).toFixed(2)} · custo R${' '}
                {(detail.unit_cost_cents / 100).toFixed(2)}
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Alocar mais licenças</Label>
              <Input
                type="number"
                min={1}
                className="w-32"
                value={addSeats}
                onChange={(e) => setAddSeats(e.target.value)}
              />
            </div>
            <Button onClick={() => void topUp()} disabled={saving}>
              {saving ? 'Salvando…' : 'Alocar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes do canal</CardTitle>
          <CardDescription>
            Customer tenants deste Partner. Não entram na lista Empresas (venda direta).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customersLoading ? (
            <p className="text-sm text-muted-foreground">Carregando carteira…</p>
          ) : customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente no canal ainda.</p>
          ) : (
            <div className="divide-y rounded-md border text-sm">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                  onClick={() => navigate(`/superadmin/clients/${c.id}`)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.admin_email || c.slug} · {c.sell_plan_name || 'sem plano'} · {c.status}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.users_count} usuário{c.users_count === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Memberships</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {detail.memberships.map((m) => (
            <div key={m.id} className="flex justify-between border-b py-2 last:border-0">
              <span>{m.email || m.id}</span>
              <span className="text-muted-foreground">
                {m.role} · {m.status}
              </span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            Admin: {detail.admin_email || '—'} · painel Partner em <code>/partner</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suspensão / migração D15</CardTitle>
          <CardDescription>
            Clientes continuam ativos na Platform com o preço que pagavam (override fixed_price).
            WL e login Partner são bloqueados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.partner_status === 'suspended' ? (
            <Badge variant="destructive">Já suspenso</Badge>
          ) : null}
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Contrato encerrado, inadimplência…"
              disabled={detail.partner_status === 'suspended' && events.length > 0}
            />
          </div>
          <Button
            variant="destructive"
            disabled={saving}
            onClick={() => void suspend()}
          >
            {detail.partner_status === 'suspended'
              ? 'Reexecutar migração (idempotente)'
              : 'Suspender e migrar clientes'}
          </Button>
          {events.length > 0 ? (
            <div className="divide-y rounded-md border text-sm">
              {events.map((e) => (
                <div key={e.id} className="px-3 py-2">
                  <div className="font-medium">{new Date(e.created_at).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    migrados {e.customers_migrated} · overrides {e.price_overrides_created}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
