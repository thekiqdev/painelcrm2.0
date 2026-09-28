import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw, Search } from 'lucide-react';
import { apiClient, getApiUrl } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/sonner';

type AuditEvent = {
  id: string;
  actor: string;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  origin: string | null;
  correlation_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Financeiro → Logs de auditoria (Billing 2.0 Sprint 7).
 */
export default function SuperAdminBilling2LogsPage() {
  const [tenantId, setTenantId] = useState('');
  const [billingId, setBillingId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (tenantId.trim()) params.set('tenant_id', tenantId.trim());
    if (billingId.trim()) params.set('billing_id', billingId.trim());
    if (action.trim()) params.set('action', action.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (q.trim()) params.set('q', q.trim());
    params.set('limit', '100');
    return params;
  }, [tenantId, billingId, action, from, to, q]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<{ events: AuditEvent[]; total: number }>(
      `/api/superadmin/billing/audit-events?${buildQuery().toString()}`
    );
    setLoading(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Falha ao carregar logs');
      return;
    }
    setEvents(res.data.events);
    setTotal(res.data.total);
  }, [buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    try {
      const token = apiClient.getToken() ?? '';
      const url = `${getApiUrl()}/api/superadmin/billing/audit-events/export.csv?${buildQuery().toString()}`;
      const r = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error((body as { error?: string }).error ?? `Export falhou (${r.status})`);
        return;
      }
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'billing-audit-events.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('CSV exportado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no export');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/superadmin/financeiro">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar ao Financeiro
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Logs de auditoria</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trilha append-only (`billing_audit_events`). Payloads já sanitizados no writer.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Tenant, billing_id, action e período. Export CSV (até 5000 linhas; default 90d no servidor se
            omitir datas).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>Tenant ID</Label>
              <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="uuid" />
            </div>
            <div className="space-y-1">
              <Label>Billing ID</Label>
              <Input value={billingId} onChange={(e) => setBillingId(e.target.value)} placeholder="uuid" />
            </div>
            <div className="space-y-1">
              <Label>Action</Label>
              <Input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="ex.: collection_policy.updated"
              />
            </div>
            <div className="space-y-1">
              <Label>De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Busca</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="action, reason, actor…"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {loading ? 'Carregando…' : 'Atualizar'}
            </Button>
            <Button variant="outline" onClick={() => void exportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos ({total})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Nenhum evento no filtro.
                  </TableCell>
                </TableRow>
              )}
              {events.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(e)}
                >
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(e.created_at).toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {e.entity_type}
                    {e.entity_id ? (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {e.entity_id.slice(0, 8)}…
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">{e.actor}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">{e.reason ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {selected && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Detalhe sanitizado</span>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Fechar
                </Button>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                <div>id: {selected.id}</div>
                <div>correlation: {selected.correlation_id ?? '—'}</div>
                <div>origin: {selected.origin ?? '—'}</div>
                <div>actor_type: {selected.actor_type}</div>
              </div>
              <pre className="overflow-auto rounded bg-background p-2 text-[11px]">
                {JSON.stringify(selected.payload ?? {}, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
