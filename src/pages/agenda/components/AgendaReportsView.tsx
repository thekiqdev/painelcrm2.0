import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, subMonths, subDays, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAppointmentsReportsSummary } from '@/services/appointments';
import { TYPE_OPTIONS } from '../agendaConstants';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ReportsFiltersSheet, type ReportsFiltersDraft } from './ReportsFiltersSheet';

type Props = {
  members: Array<{ id: string; name: string }>;
  /** Opções do filtro por tipo (inclui tipos legados + labels da API). */
  typeFilterOptions?: { value: string; label: string }[];
  /** Mobile: expõe ações para o header da página (filtro + export). */
  onMobileChrome?: (api: AgendaReportsMobileChromeApi | null) => void;
};

export type AgendaReportsMobileChromeApi = {
  hasActiveFilters: boolean;
  openFilters: () => void;
  exportCsv: () => void;
  canExport: boolean;
};

type Preset = 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function toSheetDraft(
  preset: Preset,
  dateFrom: Date,
  dateTo: Date,
  responsibleUserId: string,
  typeFilter: string,
): ReportsFiltersDraft {
  if (preset === 'lastMonth' || preset === 'custom') {
    return { preset: 'custom', dateFrom, dateTo, responsibleUserId, typeFilter };
  }
  if (preset === 'thisMonth') {
    return { preset: 'thisMonth', dateFrom, dateTo, responsibleUserId, typeFilter };
  }
  return { preset: 'last30', dateFrom, dateTo, responsibleUserId, typeFilter };
}

function MobileKpiCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-2.5 py-2 shadow-sm">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function MobileSectionTitle({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span aria-hidden>{emoji}</span>
      {children}
    </h2>
  );
}

function MobileReportsSkeleton() {
  return (
    <div className="space-y-3 md:hidden" aria-hidden>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-[52px] animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
      <div className="h-24 animate-pulse rounded-xl bg-muted/50" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[52px] animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}

export function AgendaReportsView({ members, typeFilterOptions = TYPE_OPTIONS, onMobileChrome }: Props) {
  const isMobile = useIsMobile();
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>('last30');
  const [dateFrom, setDateFrom] = useState<Date>(() => startOfDay(subDays(new Date(), 29)));
  const [dateTo, setDateTo] = useState<Date>(() => endOfDay(new Date()));
  const [responsibleUserId, setResponsibleUserId] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const onPreset = (p: Preset) => {
    const now = new Date();
    setPreset(p);
    if (p === 'last30') {
      setDateFrom(startOfDay(subDays(now, 29)));
      setDateTo(endOfDay(now));
      return;
    }
    if (p === 'thisMonth') {
      setDateFrom(startOfMonth(now));
      setDateTo(endOfDay(now));
      return;
    }
    if (p === 'lastMonth') {
      const m = subMonths(now, 1);
      setDateFrom(startOfMonth(m));
      setDateTo(endOfMonth(m));
    }
  };

  const params = useMemo(
    () => ({
      date_from: startOfDay(dateFrom).toISOString(),
      date_to: endOfDay(dateTo).toISOString(),
      responsible_user_id: responsibleUserId || undefined,
      type: typeFilter || undefined,
    }),
    [dateFrom, dateTo, responsibleUserId, typeFilter],
  );

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['appointments', 'reports', params],
    queryFn: () => getAppointmentsReportsSummary(params),
    staleTime: 20_000,
  });

  const exportCsv = useCallback(() => {
    if (!data) return;
    const lines: string[] = [];
    lines.push('secao,metric,valor');
    lines.push(`summary,total,${data.summary.total}`);
    lines.push(`summary,scheduled,${data.summary.scheduled}`);
    lines.push(`summary,done,${data.summary.done}`);
    lines.push(`summary,cancelled,${data.summary.cancelled}`);
    lines.push(`summary,no_show,${data.summary.no_show}`);
    lines.push(`summary,confirmed,${data.summary.confirmed}`);
    lines.push(`summary,not_confirmed,${data.summary.not_confirmed}`);
    lines.push(`summary,pending_confirmation,${data.summary.pending_confirmation}`);
    lines.push(`summary,needs_reschedule,${data.summary.needs_reschedule}`);
    lines.push(`summary,declined,${data.summary.declined}`);
    lines.push(`summary,follow_ups_created,${data.summary.follow_ups_created}`);
    lines.push(`summary,completion_rate,${data.summary.completion_rate}`);
    lines.push('');
    lines.push('por_responsavel,user_id,nome,total,done,cancelled,no_show,completion_rate');
    for (const r of data.by_responsible) {
      lines.push(
        [
          'por_responsavel',
          csvEscape(r.user_id ?? ''),
          csvEscape(r.name),
          r.total,
          r.done,
          r.cancelled,
          r.no_show,
          r.completion_rate,
        ].join(','),
      );
    }
    lines.push('');
    lines.push('por_tipo,type,label,total,done');
    for (const r of data.by_type) {
      lines.push(['por_tipo', csvEscape(r.type), csvEscape(r.label), r.total, r.done].join(','));
    }
    lines.push('');
    lines.push('por_resultado,outcome,label,total');
    for (const r of data.by_outcome) {
      lines.push(['por_resultado', csvEscape(r.outcome), csvEscape(r.label), r.total].join(','));
    }

    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agenda-relatorio-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const hasActiveReportsFilters = Boolean(preset !== 'last30' || responsibleUserId || typeFilter);

  const applyMobileFilters = useCallback((next: ReportsFiltersDraft) => {
    setResponsibleUserId(next.responsibleUserId);
    setTypeFilter(next.typeFilter);
    setDateFrom(next.dateFrom);
    setDateTo(next.dateTo);
    if (next.preset === 'last30') setPreset('last30');
    else if (next.preset === 'thisMonth') setPreset('thisMonth');
    else setPreset('custom');
  }, []);

  const clearMobileFilters = useCallback(() => {
    const now = new Date();
    setPreset('last30');
    setDateFrom(startOfDay(subDays(now, 29)));
    setDateTo(endOfDay(now));
    setResponsibleUserId('');
    setTypeFilter('');
  }, []);

  const sheetApplied = useMemo(
    () => toSheetDraft(preset, dateFrom, dateTo, responsibleUserId, typeFilter),
    [preset, dateFrom, dateTo, responsibleUserId, typeFilter],
  );

  const openFilters = useCallback(() => setFiltersSheetOpen(true), []);

  useEffect(() => {
    if (!isMobile || !onMobileChrome) return;
    onMobileChrome({
      hasActiveFilters: hasActiveReportsFilters,
      openFilters,
      exportCsv,
      canExport: Boolean(data),
    });
    return () => onMobileChrome(null);
  }, [isMobile, onMobileChrome, hasActiveReportsFilters, openFilters, exportCsv, data]);

  const sharedError = isError ? (
    <Alert variant="destructive">
      <AlertTitle>Erro ao carregar relatório</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-2">
        <span>{error instanceof Error ? error.message : 'Falha inesperada.'}</span>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;

  const sharedEmpty = !isPending && !isError && (!data || data.summary.total === 0) ? (
    <p className="text-sm text-muted-foreground">Nenhum compromisso encontrado neste período.</p>
  ) : null;

  return (
    <div className="space-y-3 md:space-y-4">
      {isMobile ? (
        <ReportsFiltersSheet
          open={filtersSheetOpen}
          onOpenChange={setFiltersSheetOpen}
          members={members}
          typeFilterOptions={typeFilterOptions}
          applied={sheetApplied}
          onApply={applyMobileFilters}
          onClear={clearMobileFilters}
        />
      ) : null}

      <div className="hidden rounded-lg border border-border/80 bg-card/30 p-3 md:block md:space-y-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Período</span>
          <Button size="sm" variant={preset === 'last30' ? 'default' : 'outline'} onClick={() => onPreset('last30')}>
            Últimos 30 dias
          </Button>
          <Button size="sm" variant={preset === 'thisMonth' ? 'default' : 'outline'} onClick={() => onPreset('thisMonth')}>
            Este mês
          </Button>
          <Button size="sm" variant={preset === 'lastMonth' ? 'default' : 'outline'} onClick={() => onPreset('lastMonth')}>
            Mês passado
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>De</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  {format(dateFrom, 'P', { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => {
                    if (!d) return;
                    setPreset('custom');
                    setDateFrom(startOfDay(d));
                  }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>Até</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  {format(dateTo, 'P', { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => {
                    if (!d) return;
                    setPreset('custom');
                    setDateTo(endOfDay(d));
                  }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select
              value={responsibleUserId || '__all__'}
              onValueChange={(v) => setResponsibleUserId(v === '__all__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={typeFilter || '__all__'} onValueChange={(v) => setTypeFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {typeFilterOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={exportCsv} disabled={!data}>
              Exportar CSV
            </Button>
          </div>
        </div>
      </div>

      {isPending ? (
        <>
          <div className="hidden md:flex md:items-center md:justify-center md:py-10 md:text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            A carregar relatório…
          </div>
          {isMobile ? <MobileReportsSkeleton /> : null}
        </>
      ) : null}

      {!isPending ? sharedError : null}
      {!isPending ? sharedEmpty : null}

      {!isPending && !isError && data && data.summary.total > 0 ? (
        <>
          <div className="hidden md:block">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Compromissos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Concluídos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.done}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Cancelados</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.cancelled}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">No-show</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.no_show}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Follow-ups criados</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.follow_ups_created}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Taxa de conclusão</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.completion_rate}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Confirmados</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.confirmed}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Não confirmados</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.not_confirmed}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Aguardando confirmação</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.pending_confirmation}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Precisa remarcar</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.needs_reschedule}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Recusados</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{data.summary.declined}</p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Por responsável</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Concluídos</TableHead>
                        <TableHead>Cancelados</TableHead>
                        <TableHead>No-show</TableHead>
                        <TableHead>Taxa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.by_responsible.map((r) => (
                        <TableRow key={r.user_id ?? 'none'}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{r.total}</TableCell>
                          <TableCell>{r.done}</TableCell>
                          <TableCell>{r.cancelled}</TableCell>
                          <TableCell>{r.no_show}</TableCell>
                          <TableCell>{r.completion_rate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Por tipo</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Concluídos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.by_type.map((r) => (
                        <TableRow key={r.type}>
                          <TableCell>{r.label}</TableCell>
                          <TableCell>{r.total}</TableCell>
                          <TableCell>{r.done}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Por resultado</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_outcome.map((r) => (
                      <TableRow key={r.outcome}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell>{r.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3 md:hidden">
            <section className="space-y-2">
              <MobileSectionTitle emoji="📊">Resumo</MobileSectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <MobileKpiCell label="Compromissos" value={data.summary.total} />
                <MobileKpiCell label="Concluídos" value={data.summary.done} />
                <MobileKpiCell label="Cancelados" value={data.summary.cancelled} />
                <MobileKpiCell label="No-show" value={data.summary.no_show} />
              </div>
            </section>

            <div
              className={cn(
                'rounded-xl border-2 border-primary/25 bg-primary/5 px-4 py-4 text-center shadow-sm',
                'dark:border-primary/35 dark:bg-primary/10',
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Taxa de conclusão</p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                {data.summary.completion_rate}%
              </p>
            </div>

            <section className="space-y-2">
              <MobileSectionTitle emoji="📩">Confirmação</MobileSectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <MobileKpiCell label="Confirmados" value={data.summary.confirmed} />
                <MobileKpiCell label="Não confirmados" value={data.summary.not_confirmed} />
                <MobileKpiCell label="Aguardando" value={data.summary.pending_confirmation} />
                <MobileKpiCell label="Remarcar" value={data.summary.needs_reschedule} />
                <div className="col-span-2">
                  <MobileKpiCell label="Recusados" value={data.summary.declined} />
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <MobileSectionTitle emoji="👤">Por responsável</MobileSectionTitle>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/40">
                {data.by_responsible.map((r) => (
                  <li key={r.user_id ?? 'none'} className="px-3 py-2.5">
                    <p className="text-sm font-semibold leading-tight text-foreground">{r.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.total} compromissos • {r.done} concluído{r.done === 1 ? '' : 's'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <MobileSectionTitle emoji="🏷️">Por tipo</MobileSectionTitle>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/40">
                {data.by_type.map((r) => (
                  <li key={r.type} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{r.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {r.total} compromissos
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <MobileSectionTitle emoji="✅">Por resultado</MobileSectionTitle>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card/40">
                {data.by_outcome.map((r) => (
                  <li key={r.outcome} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{r.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {r.total} registro{r.total === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
