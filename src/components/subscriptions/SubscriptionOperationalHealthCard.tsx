import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  recurringBadgeClassName,
  resolveSubscriptionProcessingHealth,
} from '@/lib/subscriptionRecurringDisplay';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock } from 'lucide-react';
import {
  clampRecurringGenerateDaysBeforeDue,
  computeRecurringGenerationDateYmd,
} from '@/lib/recurringGenerationPreview';

function formatCheck(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function formatYmdBr(ymd: string | null | undefined): string {
  if (!ymd || ymd.length < 10) return '—';
  return format(new Date(`${ymd.slice(0, 10)}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR });
}

function workerPillClass(status: string): string {
  const lower = status.toLowerCase();
  const variant =
    lower.includes('falha') ? 'error'
    : lower.includes('processando') ? 'processing'
    : lower.includes('reprocessamento') || lower.includes('aguardando') || lower.includes('fila')
      ? 'awaiting'
      : lower.includes('concluído') ? 'success'
      : 'neutral';
  return cn(
    'inline-flex rounded-md border px-2 py-0.5 text-xs font-medium',
    recurringBadgeClassName[variant]
  );
}

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
};

export function SubscriptionOperationalHealthCard({ detail, className }: Props) {
  const legacyHealth = !detail.automation_summary
    ? resolveSubscriptionProcessingHealth({
        subscriptionStatus: detail.subscription.status,
        nextBillingDate: detail.subscription.next_billing_date,
        lastJobAt: detail.subscription.last_job_at,
        tenantBilling: detail.tenant_billing,
        recentJobs: detail.recent_jobs,
      })
    : null;
  const summary = detail.automation_summary;
  const nextYmd = detail.subscription.next_billing_date?.slice(0, 10);
  const daysBefore = clampRecurringGenerateDaysBeforeDue(
    detail.tenant_billing.recurring_invoice_generate_days_before_due
  );
  const nextGen =
    summary?.next_generation_ymd ??
    (nextYmd && nextYmd.length === 10 ? computeRecurringGenerationDateYmd(nextYmd, daysBefore) : null);
  const nextCharge = summary?.next_charge_ymd ?? nextYmd ?? null;

  if (detail.subscription.status === 'cancelled') {
    return null;
  }

  if (!summary && legacyHealth) {
    return (
      <Card className={cn('border border-sky-200/60 bg-sky-50/30 dark:bg-sky-950/15 shadow-sm', className)}>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground/90">
            <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
            Processamento automático
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm pb-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{legacyHealth.lastCheckLabel}</p>
            <p className="font-medium tabular-nums">{formatCheck(legacyHealth.lastCheckAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {legacyHealth.nextAttemptLabel ?? 'Próximo processamento'}
            </p>
            <p className="font-medium tabular-nums">
              {legacyHealth.nextAttemptAt ? formatCheck(legacyHealth.nextAttemptAt) : 'Conforme agenda da conta'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Situação</p>
            <span className={workerPillClass(legacyHealth.statusLabel)}>{legacyHealth.statusLabel}</span>
          </div>
          {legacyHealth.hint ? (
            <p className="sm:col-span-3 text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
              {legacyHealth.hint}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border border-sky-200/60 bg-sky-50/30 dark:bg-sky-950/15 shadow-sm', className)}>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground/90">
          <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
          Processamento automático
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm pb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Última geração</p>
          <p className="font-medium tabular-nums leading-snug">
            {summary?.last_generation_label ?? formatYmdBr(summary?.last_generation_at?.slice(0, 10))}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Próxima geração prevista</p>
          <p className="font-medium tabular-nums">{formatYmdBr(nextGen)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Próxima cobrança (vencimento)</p>
          <p className="font-medium tabular-nums">{formatYmdBr(nextCharge)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Status do worker</p>
          <span className={workerPillClass(summary?.worker_status_pt ?? '—')}>
            {summary?.worker_status_pt ?? '—'}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Última verificação</p>
          <p className="font-medium tabular-nums">{formatCheck(summary?.last_worker_check_at ?? null)}</p>
        </div>
        {nextYmd && nextGen && daysBefore > 0 ? (
          <p className="sm:col-span-2 lg:col-span-5 text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
            Geração antecipada: {daysBefore} dia(s) antes do vencimento ({formatYmdBr(nextCharge)}).
            O vencimento da fatura no histórico continua sendo a data do ciclo, não o mês civil.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
