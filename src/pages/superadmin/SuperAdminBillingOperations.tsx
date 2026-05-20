import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  superadminBillingOpsService,
  type BillingHealthScore,
  type BillingHealthSnapshot,
} from '@/services/superadminBillingOps';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Play,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react';

function scoreConfig(score: BillingHealthScore) {
  if (score === 'healthy') {
    return {
      label: 'Saudável',
      icon: CheckCircle2,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    };
  }
  if (score === 'warning') {
    return {
      label: 'Atenção',
      icon: AlertTriangle,
      className: 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
    };
  }
  return {
    label: 'Crítico',
    icon: AlertTriangle,
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  };
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
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
        <p
          className={cn(
            'text-2xl font-semibold tabular-nums mt-1',
            accent === 'warn' && 'text-amber-700 dark:text-amber-300',
            accent === 'error' && 'text-destructive'
          )}
        >
          {value}
        </p>
        {sub ? <p className="text-[11px] text-muted-foreground mt-1">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function IssueTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ entity_id: string; detail: string; tenant_id?: string | null }>;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border rounded-md bg-muted/20">{empty}</p>
      ) : (
        <div className="rounded-md border overflow-x-auto max-h-48 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">ID</TableHead>
                <TableHead className="text-xs">Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.entity_id}>
                  <TableCell className="font-mono text-[10px] max-w-[140px] truncate">{r.entity_id}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function SuperAdminBillingOperations() {
  const [health, setHealth] = useState<BillingHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const h = await superadminBillingOpsService.getHealth();
      setHealth(h);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar saúde do billing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runRecovery = async (dryRun: boolean) => {
    try {
      setRunning(true);
      const report = await superadminBillingOpsService.runRecovery(dryRun);
      toast.success(
        dryRun
          ? `Simulação concluída (${report.repairs.reduce((s, r) => s + r.count, 0)} itens)`
          : `Recovery aplicado · saúde ${report.health_before} → ${report.health_after}`
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro no recovery');
    } finally {
      setRunning(false);
    }
  };

  const score = health?.score ?? 'warning';
  const sc = scoreConfig(score);
  const ScoreIcon = sc.icon;

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <HeartPulse className="h-4 w-4" />
            <span>Operações financeiras</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Billing Recovery Engine</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Observabilidade, reconciliação e auto-healing leve do motor recorrente. Não altera valores,{' '}
            <code className="text-xs">cycle_key</code> nem <code className="text-xs">next_billing_date</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={running}
            onClick={() => void runRecovery(true)}
          >
            <Play className="h-4 w-4 mr-1" />
            Dry-run
          </Button>
          <Button size="sm" disabled={running} onClick={() => void runRecovery(false)}>
            <Zap className="h-4 w-4 mr-1" />
            Executar recovery
          </Button>
        </div>
      </div>

      <Card className="border shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/30 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Health score
              </CardTitle>
              <CardDescription className="mt-1">
                {health?.generated_at
                  ? `Atualizado ${format(new Date(health.generated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                  : '—'}
                {health?.dry_run_default ? ' · dry-run padrão ativo no servidor' : ''}
              </CardDescription>
            </div>
            <Badge variant="outline" className={cn('text-sm px-3 py-1', sc.className)}>
              <ScoreIcon className="h-3.5 w-3.5 mr-1.5" />
              {sc.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading && !health ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando diagnóstico…</p>
          ) : health ? (
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              {health.score_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {health ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard title="Jobs pending" value={health.counts.pending_jobs} />
            <MetricCard
              title="Jobs failed"
              value={health.counts.failed_jobs}
              sub={`janela ${health.jobs_summary.window_days}d`}
              accent={health.counts.failed_jobs > 0 ? 'warn' : 'default'}
            />
            <MetricCard
              title="Processing travados"
              value={health.counts.stuck_processing_jobs}
              accent={health.counts.stuck_processing_jobs > 0 ? 'error' : 'default'}
            />
            <MetricCard
              title="Ciclos órfãos"
              value={health.counts.orphan_cycles}
              accent={health.counts.orphan_cycles > 0 ? 'warn' : 'default'}
            />
            <MetricCard
              title="Faturas órfãs"
              value={health.counts.orphan_invoices}
              accent={health.counts.orphan_invoices > 0 ? 'warn' : 'default'}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Notify failed" value={health.counts.failed_notifications} accent="warn" />
            <MetricCard title="Notify fila presa" value={health.counts.stuck_notification_queue} />
            <MetricCard title="Retry queue due" value={health.counts.retry_queue_due} />
            <MetricCard title="Gateway issues" value={health.counts.gateway_failures} accent="warn" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  Heartbeat worker / scheduler
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {!health.heartbeats.table_present ? (
                  <p className="text-muted-foreground text-xs">Tabela de heartbeat ausente (migração 248).</p>
                ) : (
                  health.heartbeats.heartbeats.map((h) => (
                    <div
                      key={h.process_key}
                      className="flex justify-between items-center border rounded-md px-3 py-2 bg-muted/20"
                    >
                      <span className="font-medium capitalize">{h.process_key}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {h.age_minutes.toFixed(1)} min
                        {h.stale ? (
                          <Badge variant="outline" className="ml-2 text-destructive border-destructive/30">
                            stale
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-2 text-emerald-700 border-emerald-200">
                            ok
                          </Badge>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Recovery audit (recente)</CardTitle>
              </CardHeader>
              <CardContent>
                {health.samples.recent_recovery_audit.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum registo (migração 249 ou dry-run apenas).</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto text-xs font-mono space-y-1">
                    {health.samples.recent_recovery_audit.slice(0, 12).map((a) => (
                      <div key={a.id} className="text-muted-foreground border-b border-border/40 py-1">
                        {a.created_at.slice(0, 19)} · {a.action_type}
                        {a.dry_run ? ' [dry]' : ''}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Amostras de inconsistência</CardTitle>
              <CardDescription>Primeiras ocorrências detectadas — ver detalhe técnico em jobs recorrentes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <IssueTable
                title="Ciclos órfãos / parados"
                rows={health.samples.orphan_cycles}
                empty="Nenhum ciclo inconsistente na amostra."
              />
              <IssueTable
                title="Faturas órfãs"
                rows={health.samples.orphan_invoices}
                empty="Nenhuma fatura órfã na amostra."
              />
              <IssueTable
                title="Notificações"
                rows={health.samples.failed_notifications}
                empty="Sem falhas de notificação na amostra."
              />
              <IssueTable
                title="Jobs processing travados"
                rows={health.samples.stuck_processing_jobs}
                empty="Nenhum job preso em processing."
              />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            <Link to="/superadmin/subscription-cycles" className="text-primary underline">
              Ciclos de assinatura
            </Link>
            {' · '}
            Cron sugerido: <code className="text-[10px]">npm run billing:ops-reconciliation</code> (env{' '}
            <code className="text-[10px]">BILLING_RECOVERY_DRY_RUN</code>).
          </p>
        </>
      ) : null}
    </div>
  );
}
