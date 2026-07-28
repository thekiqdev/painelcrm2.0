import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, RotateCcw } from 'lucide-react';
import { apiClient } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/sonner';

type Health = {
  window_hours: number;
  total: number;
  processed: number;
  failed: number;
  pending: number;
  ok_rate: number | null;
  last_webhook_received_at: string | null;
  last_webhook_error: string | null;
};

type WhEvent = {
  event_id: string;
  event_type: string | null;
  status: string;
  payment_id: string | null;
  last_error: string | null;
  attempts: number | null;
  external_reference: string | null;
  created_at: string | null;
  reprocessable: boolean;
};

/**
 * Financeiro → Webhooks (Billing 2.0 Sprint 7).
 */
export default function SuperAdminBilling2WebhooksPage() {
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [events, setEvents] = useState<WhEvent[]>([]);
  const [reprocessing, setReprocessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('window_hours', '24');
    if (status !== 'all') params.set('status', status);
    params.set('limit', '50');
    const res = await apiClient.get<{ health: Health; events: WhEvent[] }>(
      `/api/superadmin/billing/webhooks/health?${params.toString()}`
    );
    setLoading(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Falha ao carregar webhooks');
      return;
    }
    setHealth(res.data.health);
    setEvents(res.data.events);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const reprocess = async (eventId: string) => {
    setReprocessing(eventId);
    const res = await apiClient.post<{ ok: boolean; error?: string }>(
      `/api/superadmin/billing/webhooks/${encodeURIComponent(eventId)}/reprocess`,
      {}
    );
    setReprocessing(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Reprocess concluído');
    void load();
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
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saúde do webhook SaaS (gateway ativo). Reprocess só para eventos <code className="text-xs">failed</code> com
          payload em <code className="text-xs">payment_events</code>. Token inválido continua 401.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total (24h)" value={health?.total ?? '—'} />
        <StatCard label="Processados" value={health?.processed ?? '—'} />
        <StatCard label="Failed" value={health?.failed ?? '—'} danger={(health?.failed ?? 0) > 0} />
        <StatCard
          label="Taxa OK"
          value={health?.ok_rate != null ? `${health.ok_rate}%` : '—'}
        />
      </div>

      {(health?.last_webhook_error || health?.last_webhook_received_at) && (
        <p className="text-xs text-muted-foreground">
          Último recebido:{' '}
          {health.last_webhook_received_at
            ? new Date(health.last_webhook_received_at).toLocaleString('pt-BR')
            : '—'}
          {health.last_webhook_error ? ` · Erro config: ${health.last_webhook_error}` : ''}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Últimos eventos</CardTitle>
            <CardDescription>
              Fonte: eventos do gateway SaaS (+ debug payment_webhook_events).
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="processed">processed</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    {loading ? 'Carregando…' : 'Nenhum evento.'}
                  </TableCell>
                </TableRow>
              )}
              {events.map((e) => (
                <TableRow key={e.event_id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {e.created_at ? new Date(e.created_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{e.event_type ?? '—'}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {e.event_id.slice(0, 12)}…
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.status === 'failed'
                          ? 'destructive'
                          : e.status === 'processed'
                            ? 'default'
                            : 'outline'
                      }
                    >
                      {e.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.payment_id ?? '—'}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">{e.last_error ?? '—'}</TableCell>
                  <TableCell>
                    {e.reprocessable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reprocessing === e.event_id}
                        onClick={() => void reprocess(e.event_id)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Reprocess
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Runbook:{' '}
            <code className="text-[10px]">
              docs/architecture/commercial/billing2/BILLING2_WEBHOOK_FAILED_RUNBOOK.md
            </code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard(props: { label: string; value: string | number; danger?: boolean }) {
  return (
    <Card className={props.danger ? 'border-destructive/40' : undefined}>
      <CardHeader className="pb-1 pt-3">
        <CardDescription>{props.label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{props.value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
