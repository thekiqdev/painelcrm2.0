import { Link } from 'react-router-dom';
import { MessageSquareText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { PlatformSupportTicket } from '@/types/platformSupport';
import { SupportCategoryLabel, SupportPriorityBadge, SupportStatusBadge } from './supportUi';

function previewMessage(message: string, max = 120) {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

type SupportTicketCardProps = {
  ticket: PlatformSupportTicket;
  compact?: boolean;
  className?: string;
};

export function SupportTicketCard({ ticket, compact = false, className }: SupportTicketCardProps) {
  const updatedLabel = formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true, locale: ptBR });
  const hasThreadActivity = ticket.updated_at !== ticket.created_at;
  const isOptimistic = ticket.id.startsWith('optimistic-');

  const cardClassName = cn(
    'group block rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:border-primary/25 hover:shadow-md',
    compact ? 'p-3.5' : 'p-4 md:p-5',
    isOptimistic && 'pointer-events-none opacity-70',
    className,
  );

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SupportStatusBadge status={ticket.status} size={compact ? 'sm' : 'default'} />
            <SupportPriorityBadge priority={ticket.priority} size={compact ? 'sm' : 'default'} />
          </div>
          <h3 className="font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
            {ticket.subject}
          </h3>
          <p className={cn('line-clamp-2 text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
            {previewMessage(ticket.message)}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground',
          compact && 'mt-2.5 pt-2.5',
        )}
      >
        <SupportCategoryLabel category={ticket.category} />
        <div className="flex items-center gap-3">
          <span>{updatedLabel}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <MessageSquareText className="h-3 w-3" aria-hidden />
            {hasThreadActivity ? 'Com respostas' : '1 mensagem'}
          </span>
        </div>
      </div>
    </>
  );

  if (isOptimistic) {
    return <div className={cardClassName}>{body}</div>;
  }

  return (
    <Link to={`/suporte/${ticket.id}`} className={cardClassName}>
      {body}
    </Link>
  );
}
