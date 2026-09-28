import { Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { PlatformSupportTicket } from '@/types/platformSupport';
import { SupportTicketCard } from './SupportTicketCard';

type SupportTicketListProps = {
  tickets: PlatformSupportTicket[];
  loading?: boolean;
  compact?: boolean;
  className?: string;
  highlightId?: string | null;
};

function SupportTicketListSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className={cn('mt-3 h-5 w-3/4', compact && 'h-4')} />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SupportTicketList({
  tickets,
  loading = false,
  compact = false,
  className,
  highlightId,
}: SupportTicketListProps) {
  const open = tickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'waiting_support').length;
  const waitingYou = tickets.filter((ticket) => ticket.status === 'waiting_customer').length;
  const closed = tickets.filter((ticket) => ticket.status === 'closed' || ticket.status === 'resolved').length;

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Seus chamados</h2>
          <p className="text-sm text-muted-foreground">Acompanhe respostas e histórico da sua empresa.</p>
        </div>
        <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {tickets.length}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Em andamento', value: open },
          { label: 'Aguardando você', value: waitingYou },
          { label: 'Encerrados', value: closed },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-center shadow-sm"
          >
            <p className="text-lg font-semibold tabular-nums">{item.value}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <SupportTicketListSkeleton compact={compact} />
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="font-medium">Nenhum chamado ainda</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Abra um chamado ou fale pelo WhatsApp para iniciar o atendimento.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <SupportTicketCard
              key={ticket.id}
              ticket={ticket}
              compact={compact}
              className={cn(
                highlightId === ticket.id && 'animate-in fade-in slide-in-from-top-2 border-primary/30 shadow-md duration-500',
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
