import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChevronLeft, ChevronRight, GitBranch, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchLifecycleTransitions,
  LIFECYCLE_EVENT_FILTER_OPTIONS,
  LIFECYCLE_RESULT_FILTER_OPTIONS,
  type LifecycleDashboardMetrics,
  type LifecycleTransitionRow,
  type LifecycleTransitionsResponse,
} from '@/services/superadminLifecycleDashboard';

const ALL = '__all__';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function routeLabel(board: string | null, column: string | null): string {
  if (!board && !column) return '—';
  if (board && column) return `${board} › ${column}`;
  return board || column || '—';
}

function resultBadgeVariant(result: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (result === 'moved') return 'default';
  if (result === 'already_at_destination') return 'secondary';
  if (result === 'promotion_disabled') return 'outline';
  return 'destructive';
}

function MetricCard({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: number | string;
  sub?: string;
  accent?: 'default' | 'warn' | 'error';
}) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="pt-5 pb-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            accent === 'warn' && 'text-amber-700 dark:text-amber-300',
            accent === 'error' && 'text-destructive',
          )}
        >
          {value}
        </p>
        {sub ? <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function MetricsPanel({ metrics }: { metrics: LifecycleDashboardMetrics | null }) {
  if (!metrics) return null;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Hoje</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <MetricCard title="Eventos observados" value={metrics.today.events_observed} />
          <MetricCard title="Promoções realizadas" value={metrics.today.promotions_moved} sub="resultado moved" />
          <MetricCard
            title="Falhas"
            value={metrics.today.failures}
            accent={metrics.today.failures > 0 ? 'error' : 'default'}
          />
        </div>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">Últimos 30 dias</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="onboarding.completed" value={metrics.last_30_days.onboarding_completed} />
          <MetricCard title="subscription.activated" value={metrics.last_30_days.subscription_activated} />
          <MetricCard title="trial.expired" value={metrics.last_30_days.trial_expired} />
          <MetricCard title="subscription.cancelled" value={metrics.last_30_days.subscription_cancelled} />
        </div>
      </div>
    </div>
  );
}

function TransitionDetailSheet({
  row,
  open,
  onOpenChange,
}: {
  row: LifecycleTransitionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = row?.metadata_json ?? {};
  const route = meta.route as Record<string, unknown> | undefined;
  const destination = meta.destination as Record<string, unknown> | undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b pb-4">
          <SheetTitle>Detalhe da transição</SheetTitle>
          <SheetDescription>
            {row ? `${row.event_type} · ${formatDateTime(row.created_at)}` : ''}
          </SheetDescription>
        </SheetHeader>
        {row ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Resultado</span>
                <Badge variant={resultBadgeVariant(row.result)}>{row.result}</Badge>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Correlation ID</span>
                <span className="font-mono text-xs">{row.correlation_id ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Origem</span>
                <span className="text-right">{routeLabel(row.source_board_name, row.source_column_name)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Destino</span>
                <span className="text-right">
                  {routeLabel(row.destination_board_name, row.destination_column_name)}
                </span>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metadados</p>
              <dl className="grid gap-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">source</dt>
                  <dd className="font-mono text-xs">{String(meta.source ?? '—')}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">reason</dt>
                  <dd className="text-right text-xs">{String(meta.reason ?? '—')}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">promotion_enabled</dt>
                  <dd>{meta.promotion_enabled === true ? 'sim' : meta.promotion_enabled === false ? 'não' : '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">event type</dt>
                  <dd className="font-mono text-xs">{row.event_type}</dd>
                </div>
                {route ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">resolved route</dt>
                    <dd className="text-right text-xs">
                      {String(route.boardName ?? '')} › {String(route.columnName ?? '')}
                    </dd>
                  </div>
                ) : null}
                {destination ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">destination</dt>
                    <dd className="text-right text-xs">
                      {String(destination.boardName ?? destination.board_name ?? '')} ›{' '}
                      {String(destination.columnName ?? destination.column_name ?? '')}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">metadata_json</p>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(meta, null, 2)}
              </pre>
            </div>

            <Button type="button" variant="outline" className="w-full" disabled title="Em breve — Sprint K">
              Reprocessar (em breve)
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function LifecycleDashboard() {
  const [data, setData] = useState<LifecycleTransitionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState(ALL);
  const [result, setResult] = useState(ALL);
  const [tenantQuery, setTenantQuery] = useState('');
  const [leadQuery, setLeadQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<LifecycleTransitionRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const queryKey = useMemo(
    () => JSON.stringify({ page, eventType, result, tenantQuery, leadQuery, fromDate, toDate }),
    [page, eventType, result, tenantQuery, leadQuery, fromDate, toDate],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLifecycleTransitions({
        page,
        limit: 50,
        event_type: eventType === ALL ? undefined : eventType,
        result: result === ALL ? undefined : result,
        tenant: tenantQuery.trim() || undefined,
        lead: leadQuery.trim() || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, eventType, result, tenantQuery, leadQuery, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load, queryKey]);

  const openDetail = (row: LifecycleTransitionRow) => {
    setSelected(row);
    setDetailOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>Operações · Lifecycle</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Lifecycle Operations Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Auditoria observacional das transições registradas em <code className="text-xs">ops_lifecycle_transitions</code>.
            Somente leitura — nenhuma promoção ou automação é executada nesta tela.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('mr-1 h-4 w-4', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <MetricsPanel metrics={data?.metrics ?? null} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>Refine o histórico sem carregar a tabela completa.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Evento</Label>
              <Select value={eventType} onValueChange={(v) => { setPage(1); setEventType(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {LIFECYCLE_EVENT_FILTER_OPTIONS.map((ev) => (
                    <SelectItem key={ev} value={ev}>
                      {ev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Select value={result} onValueChange={(v) => { setPage(1); setResult(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {LIFECYCLE_RESULT_FILTER_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tenant</Label>
              <Input
                value={tenantQuery}
                onChange={(e) => { setPage(1); setTenantQuery(e.target.value); }}
                placeholder="Nome, slug ou ID"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lead</Label>
              <Input
                value={leadQuery}
                onChange={(e) => { setPage(1); setLeadQuery(e.target.value); }}
                placeholder="Nome, e-mail ou ID"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data inicial</Label>
              <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} />
            </div>
            <div className="space-y-1.5">
              <Label>Data final</Label>
              <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de transições</CardTitle>
          <CardDescription>Clique numa linha para ver metadados completos.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {loading && !data ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : data?.items.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Correlation ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openDetail(row)}
                    >
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.event_type}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{row.lead_label ?? row.acquisition_lead_id ?? '—'}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{row.tenant_label ?? row.tenant_id ?? '—'}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        {routeLabel(row.source_board_name, row.source_column_name)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">
                        <span className="text-muted-foreground">↓ </span>
                        {routeLabel(row.destination_board_name, row.destination_column_name)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={resultBadgeVariant(row.result)}>{row.result}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate font-mono text-[10px]">
                        {row.correlation_id ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.pagination.total_pages > 1 ? (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Página {data.pagination.page} de {data.pagination.total_pages} ({data.pagination.total} registros)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= data.pagination.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma transição encontrada para os filtros atuais.</p>
          )}
        </CardContent>
      </Card>

      <TransitionDetailSheet row={selected} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
