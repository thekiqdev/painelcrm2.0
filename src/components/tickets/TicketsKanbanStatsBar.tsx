import { AlertTriangle, Clock, Inbox, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface TicketKanbanStats {
  open_count: number;
  no_response_count: number;
  urgent_count: number;
  sla_overdue_count: number;
}

export function TicketsKanbanStatsBar({
  stats,
  loading,
}: {
  stats: TicketKanbanStats | undefined;
  loading?: boolean;
}) {
  const items = [
    {
      label: 'Abertos',
      value: stats?.open_count ?? 0,
      icon: Inbox,
      className: 'text-foreground',
    },
    {
      label: 'Sem resposta',
      value: stats?.no_response_count ?? 0,
      icon: Clock,
      className: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'Urgentes',
      value: stats?.urgent_count ?? 0,
      icon: Zap,
      className: 'text-orange-600 dark:text-orange-400',
    },
    {
      label: 'SLA estourado',
      value: stats?.sla_overdue_count ?? 0,
      icon: AlertTriangle,
      className: 'text-destructive',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
      {items.map((item) => (
        <Card key={item.label} className="shadow-sm">
          <CardContent className="p-3 md:p-4 flex items-center gap-3">
            <item.icon className={cn('h-5 w-5 shrink-0 opacity-80', item.className)} aria-hidden />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{item.label}</p>
              <p className={cn('text-xl font-semibold tabular-nums', item.className, loading && 'opacity-50')}>
                {loading ? '—' : item.value}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
