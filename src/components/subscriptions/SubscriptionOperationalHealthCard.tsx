import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  recurringBadgeClassName,
  resolveSubscriptionProcessingHealth,
  type SubscriptionProcessingHealth,
} from '@/lib/subscriptionRecurringDisplay';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock } from 'lucide-react';

function formatCheck(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function statusPillClass(v: SubscriptionProcessingHealth['statusVariant']): string {
  return cn(
    'inline-flex rounded-md border px-2 py-0.5 text-xs font-medium',
    recurringBadgeClassName[v === 'success' ? 'success' : v === 'error' ? 'error' : v === 'processing' ? 'processing' : v === 'awaiting' ? 'awaiting' : 'neutral']
  );
}

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
};

export function SubscriptionOperationalHealthCard({ detail, className }: Props) {
  const health = resolveSubscriptionProcessingHealth({
    subscriptionStatus: detail.subscription.status,
    nextBillingDate: detail.subscription.next_billing_date,
    lastJobAt: detail.subscription.last_job_at,
    tenantBilling: detail.tenant_billing,
    recentJobs: detail.recent_jobs,
  });

  if (detail.subscription.status === 'cancelled') {
    return null;
  }

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
          <p className="text-xs text-muted-foreground mb-1">{health.lastCheckLabel}</p>
          <p className="font-medium tabular-nums">{formatCheck(health.lastCheckAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {health.nextAttemptLabel ?? 'Próximo processamento'}
          </p>
          <p className="font-medium tabular-nums">
            {health.nextAttemptAt ? formatCheck(health.nextAttemptAt) : 'Conforme agenda da conta'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Situação</p>
          <span className={statusPillClass(health.statusVariant)}>{health.statusLabel}</span>
        </div>
        {health.hint ? (
          <p className="sm:col-span-3 text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
            {health.hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
