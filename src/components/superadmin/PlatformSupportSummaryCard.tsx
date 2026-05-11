import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Headset } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { SuperadminPlatformSupportSummary } from '@/services/platformSupport';

const intFmt = new Intl.NumberFormat('pt-BR');

type PlatformSupportSummaryCardProps = {
  summary: SuperadminPlatformSupportSummary | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function PlatformSupportSummaryCard({
  summary,
  loading = false,
  error = null,
  onRetry,
}: PlatformSupportSummaryCardProps) {
  const open = summary?.open ?? 0;
  const waitingSupport = summary?.waiting_support ?? 0;
  const urgent = summary?.urgent ?? 0;
  const resolvedToday = summary?.resolved_today ?? 0;
  const latest = summary?.latest;
  const needsAttention = open > 0 || waitingSupport > 0 || urgent > 0;

  if (loading) {
    return (
      <Card className="border-border/60 shadow-none">
        <CardHeader className="space-y-1 px-4 pb-0 pt-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 shadow-none">
        <CardHeader className="space-y-1 px-4 pb-0 pt-4">
          <CardTitle className="text-sm font-semibold tracking-tight">Chamados de suporte</CardTitle>
          <CardDescription className="text-xs text-destructive/90">{error}</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3">
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'border-border/60 shadow-none transition-shadow hover:shadow-sm',
        urgent > 0 && 'ring-1 ring-destructive/25',
        urgent === 0 && needsAttention && 'ring-1 ring-amber-500/20',
      )}
    >
      <CardHeader className="space-y-1 px-4 pb-0 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold tracking-tight">Chamados de suporte</CardTitle>
            <CardDescription className="text-xs">Fila da plataforma e último chamado recebido.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {urgent > 0 ? (
              <Badge variant="outline" className="border-destructive/35 bg-destructive/10 text-[10px] font-medium text-destructive">
                Urgente
              </Badge>
            ) : needsAttention ? (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                Em atenção
              </Badge>
            ) : null}
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Headset className="h-4 w-4" aria-hidden />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-4 pb-4 pt-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Abertos', value: open },
            { label: 'Aguardando suporte', value: waitingSupport },
            { label: 'Urgentes', value: urgent, danger: urgent > 0 },
            { label: 'Respondidos hoje', value: resolvedToday, success: resolvedToday > 0 },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                'rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5',
                item.danger && 'border-destructive/25 bg-destructive/5',
                item.success && 'border-emerald-500/20 bg-emerald-500/5',
              )}
            >
              <p className="text-[11px] leading-tight text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{intFmt.format(item.value)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Último chamado recebido</p>
          {latest ? (
            <div className="mt-1.5 space-y-1">
              <p className="text-sm font-medium leading-snug">{latest.subject}</p>
              <p className="text-xs text-muted-foreground">
                {latest.tenant_name} ·{' '}
                {formatDistanceToNow(new Date(latest.created_at), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">Nenhum chamado registrado ainda.</p>
          )}
        </div>

        <Button asChild size="sm" variant={needsAttention ? 'default' : 'outline'}>
          <Link to="/superadmin/platform-support">Ver chamados</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
