import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

type ReportRow = {
  partner_tenant_id: string;
  public_name: string;
  partner_slug: string;
  wholesale_status: string;
  wholesale_plan_name: string | null;
  seats_included: number | null;
  purchased_seats: number;
  used_seats: number;
  available_seats: number;
  subscription_status: string | null;
  next_billing_date: string | null;
  wholesale_past_due_at: string | null;
  grant_source: string | null;
  wholesale_block_after_days: number | null;
  effective_block_after_days: number;
  block_days_source: 'override' | 'global';
};

function statusBadge(status: string) {
  if (status === 'past_due') return <Badge variant="destructive">past_due</Badge>;
  if (status === 'active') return <Badge>active</Badge>;
  if (status === 'canceled') return <Badge variant="outline">canceled</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function SuperAdminPartnerWholesaleReport() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (status?: string) => {
    setLoading(true);
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiClient.get<ReportRow[]>(`/api/superadmin/partners/wholesale-report${q}`);
    setLoading(false);
    if (res.error) {
      toast.error(res.error || 'Falha ao carregar relatório');
      setRows([]);
      return;
    }
    setRows(Array.isArray(res.data) ? res.data : []);
  };

  useEffect(() => {
    void load(filter || undefined);
  }, [filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatório wholesale</h1>
          <p className="text-sm text-muted-foreground">
            Partners · plano atacado · seats · próximo vencimento · status
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === '' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('')}
          >
            Todos
          </Button>
          <Button
            variant={filter === 'past_due' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('past_due')}
          >
            Past due
          </Button>
          <Button
            variant={filter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('active')}
          >
            Active
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operacional</CardTitle>
          <CardDescription>
            {loading ? 'Carregando…' : `${rows.length} Partner(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 pr-3 font-medium">Partner</th>
                <th className="pb-2 pr-3 font-medium">Plano</th>
                <th className="pb-2 pr-3 font-medium">Seats</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 font-medium">Bloqueio</th>
                <th className="pb-2 pr-3 font-medium">Próx. cobrança</th>
                <th className="pb-2 font-medium">Sub</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partner_tenant_id} className="border-b border-border/50 last:border-0">
                  <td className="py-3 pr-3 align-top">
                    <Link
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                      to={`/superadmin/partners/${r.partner_tenant_id}`}
                    >
                      {r.public_name}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">{r.partner_slug}</p>
                    {r.grant_source === 'legacy_manual' ? (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        legado
                      </Badge>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 align-top">
                    {r.wholesale_plan_name ?? '—'}
                    {r.seats_included != null ? (
                      <p className="text-[11px] text-muted-foreground">
                        pacote {r.seats_included}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 align-top tabular-nums">
                    {r.used_seats}/{r.purchased_seats}
                    <p className="text-[11px] text-muted-foreground">
                      disp. {r.available_seats}
                    </p>
                  </td>
                  <td className="py-3 pr-3 align-top">
                    {statusBadge(r.wholesale_status)}
                    {r.wholesale_past_due_at ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        desde {new Date(r.wholesale_past_due_at).toLocaleDateString('pt-BR')}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 align-top tabular-nums">
                    {r.effective_block_after_days}d
                    <p className="text-[11px] text-muted-foreground">
                      {r.block_days_source === 'override' ? 'override' : 'global'}
                    </p>
                  </td>
                  <td className="py-3 pr-3 align-top tabular-nums">
                    {r.next_billing_date
                      ? new Date(r.next_billing_date + 'T12:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="py-3 align-top text-xs text-muted-foreground">
                    {r.subscription_status ?? '—'}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhum Partner neste filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
