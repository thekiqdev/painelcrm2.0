import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  buildSlaContextFromDashboard,
  type OperationalPanelFilter,
  type SlaContextForUi,
} from '@/lib/chatSlaUi';
import { chatService, type ChatOperationsDashboardDto } from '@/services/chat';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';

/** Métricas e lista de atendentes — manter no repositório para reutilizar numa futura rota de relatórios (fora de /chat). */

function fmtSec(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m} min ${s} s`;
}

type Props = {
  enabled: boolean;
  activeFilter: OperationalPanelFilter;
  onFilterChange: (f: OperationalPanelFilter) => void;
  onSlaContext: (ctx: SlaContextForUi | null) => void;
  refreshTrigger: number;
};

export const ChatOperationalPanel: React.FC<Props> = ({
  enabled,
  activeFilter,
  onFilterChange,
  onSlaContext,
  refreshTrigger,
}) => {
  const [data, setData] = useState<ChatOperationsDashboardDto | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const d = await chatService.getOperationsDashboard({ force });
      if (d) {
        setData(d);
        onSlaContext(buildSlaContextFromDashboard(d));
      }
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível carregar o painel de atendimento');
    } finally {
      setLoading(false);
    }
  }, [enabled, onSlaContext]);

  useEffect(() => {
    // refreshTrigger > 0 = refresh explícito → força GET; mount inicial usa TTL/cache.
    void load(refreshTrigger > 0);
  }, [load, refreshTrigger]);

  if (!enabled) return null;

  const mkBtn = (filter: OperationalPanelFilter, label: string, value: string | number, sub?: string) => (
    <button
      type="button"
      onClick={() => onFilterChange(filter)}
      className={cn(
        'flex min-w-[130px] flex-col rounded-lg border px-3 py-2 text-left transition-colors sm:min-w-[140px]',
        activeFilter === filter
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:bg-muted/40',
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums leading-tight">{value}</span>
      {sub ? <span className="text-[10px] text-muted-foreground">{sub}</span> : null}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Atendimento</h3>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void load()} disabled={loading}>
          Atualizar
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] min-w-[130px] shrink-0 rounded-lg" />
          ))}
        </div>
      ) : data ? (
        <>
          <ScrollArea className="w-full whitespace-nowrap pb-1">
            <div className="flex w-max gap-2 pb-1">
              {mkBtn('open', 'Conversas abertas', data.summary.open)}
              {mkBtn('pending', 'Aguardando atendimento', data.summary.pending)}
              {mkBtn('in_progress', 'Em atendimento', data.summary.in_progress)}
              {mkBtn('sla_at_risk', 'SLA em risco', data.summary.sla_at_risk)}
              {mkBtn('sla_breached', 'SLA vencido', data.summary.sla_breached)}
              <button
                type="button"
                className="flex min-w-[150px] flex-col rounded-lg border border-border bg-card px-3 py-2 text-left sm:min-w-[160px]"
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tempo médio 1ª resposta
                </span>
                <span className="text-xl font-semibold tabular-nums">{fmtSec(data.summary.avg_first_response_sec)}</span>
              </button>
              <button
                type="button"
                className="flex min-w-[160px] flex-col rounded-lg border border-border bg-card px-3 py-2 text-left sm:min-w-[170px]"
              >
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Resposta contínua (média)
                </span>
                <span className="text-xl font-semibold tabular-nums">{fmtSec(data.summary.avg_next_reply_sec)}</span>
              </button>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {activeFilter ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Filtro ativo no painel.</span>
              <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => onFilterChange('')}>
                Limpar filtro
              </Button>
            </div>
          ) : null}

          <Card className="border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atendentes</p>
            <ScrollArea className="max-h-[220px] w-full">
              <ul className="space-y-2 pr-3">
                {data.attendees.slice(0, 24).map((a) => (
                  <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{a.display}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          'mr-2 inline-block h-2 w-2 rounded-full align-middle',
                          a.presence === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                        )}
                      />
                      {a.presence === 'online' ? 'Disponível' : 'Indisponível'}
                      {' · '}
                      Em atendimento: {a.in_progress}
                      {a.delayed > 0 ? ` · Atrasadas: ${a.delayed}` : ''}
                      {a.avg_first_response_sec != null
                        ? ` · Média 1ª: ${fmtSec(a.avg_first_response_sec)}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </Card>
        </>
      ) : null}
    </div>
  );
};
