import { memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle2,
  ExternalLink,
  MessageCircleWarning,
  Ticket as TicketIcon,
  UserPlus,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types/tickets';
import { ticketPriorityLabels } from '@/types/tickets';
import type { Member } from '@/services/members';
import { isTicketClosedLocked } from '@/lib/ticketStatusControl';
import { resolveTicketAvatar, ticketEntityInitials } from '@/lib/resolveTicketAvatar';
import {
  getTicketSlaTone,
  isTicketSlaOverdue,
  ticketAwaitingSupport,
  ticketHasNoSupportResponse,
  ticketSlaTimeClass,
} from '@/utils/ticketKanbanDisplay';

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function QuickActionButton({
  label,
  title,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  title: string;
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 rounded-md text-muted-foreground opacity-90 transition hover:bg-background hover:text-foreground sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus-visible:opacity-100"
      title={title}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

export type TicketKanbanQuickAction = 'open' | 'resolve' | 'assign';

export const TicketKanbanCard = memo(function TicketKanbanCard({
  ticket,
  columnColor,
  assignee: _assignee,
  selected,
  onClick,
  dragHandleProps,
  onQuickAction,
  onToggleSelect,
  canResolve,
  canAssignToMe,
}: {
  ticket: Ticket;
  columnColor: string;
  assignee?: Member;
  selected?: boolean;
  onClick: () => void;
  dragHandleProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  onQuickAction: (action: TicketKanbanQuickAction) => void;
  onToggleSelect?: (checked: boolean) => void;
  canResolve?: boolean;
  canAssignToMe?: boolean;
}) {
  const slaTone = getTicketSlaTone(ticket);
  const slaOverdue = isTicketSlaOverdue(ticket);
  const timeRef = ticket.last_message_at || ticket.created_at;
  const entityLabel =
    ticket.client_name?.trim() ||
    ticket.lead_name?.trim() ||
    ticket.contact_name?.trim() ||
    null;
  const entityAvatar = resolveTicketAvatar(ticket);
  const entityInitials = ticketEntityInitials(ticket);
  const noResponse = ticketHasNoSupportResponse(ticket);
  const awaitingSupport = ticketAwaitingSupport(ticket);
  const locked = isTicketClosedLocked(ticket.status);

  return (
    <div className="group/card relative w-full">
      {onToggleSelect ? (
        <div
          className="absolute left-2 top-2 z-10"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            aria-label={`Selecionar ${ticket.subject}`}
            onCheckedChange={(c) => onToggleSelect(c === true)}
          />
        </div>
      ) : null}

      <button
        type="button"
        {...dragHandleProps}
        data-ticket-kanban-card-id={ticket.id}
        className={cn(
          'relative w-full cursor-grab rounded-xl border border-border/70 bg-card p-3 text-left shadow-sm transition-[box-shadow,border-color,background-color,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
          onToggleSelect && 'pl-8',
          slaOverdue && 'ring-2 ring-destructive/75 border-destructive/60',
          selected && 'ring-2 ring-primary border-primary/40'
        )}
        onClick={onClick}
      >
        <div className="flex min-w-0 gap-2.5">
          <Avatar className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-border/60">
            {entityAvatar ? (
              <AvatarImage
                src={entityAvatar}
                alt={entityLabel ?? ticket.subject}
                className="object-cover"
              />
            ) : null}
            <AvatarFallback className="rounded-lg text-xs font-semibold">
              {entityInitials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-foreground line-clamp-2">
                  {ticket.subject}
                </p>
                {entityLabel ? (
                  <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <TicketIcon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                    <span className="truncate">{entityLabel}</span>
                  </p>
                ) : null}
                {ticket.ticket_number ? (
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground/90">
                    {ticket.ticket_number}
                  </p>
                ) : null}
              </div>
              <span className={cn('shrink-0 text-[10px] tabular-nums', ticketSlaTimeClass[slaTone])}>
                {formatDistanceToNow(new Date(timeRef), { addSuffix: true, locale: ptBR })}
              </span>
            </div>

            <div className="flex flex-wrap gap-1 pt-0.5">
              <Badge
                variant="outline"
                className="h-5 max-w-[8.5rem] border-0 px-1.5 py-0 text-[10px] text-white"
                style={{ backgroundColor: columnColor }}
              >
                <span className="truncate">{ticketPriorityLabels[ticket.priority]}</span>
              </Badge>
              {noResponse ? (
                <Badge variant="secondary" className="h-5 px-1.5 py-0 text-[10px] font-normal">
                  Sem resposta
                </Badge>
              ) : null}
              {awaitingSupport ? (
                <Badge
                  variant="outline"
                  className="h-5 gap-0.5 px-1.5 py-0 text-[10px] font-normal border-amber-400/80 text-amber-800 dark:text-amber-300"
                >
                  <MessageCircleWarning className="h-2.5 w-2.5 shrink-0" aria-hidden />
                  Aguardando suporte
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </button>

      {!locked ? (
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-border/50 bg-background/95 p-0.5 shadow-sm opacity-95 sm:opacity-0 sm:transition-opacity sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100">
          <div className="pointer-events-auto flex items-center gap-0.5">
            <QuickActionButton
              label="Abrir ticket"
              title="Abrir ticket"
              icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onQuickAction('open');
              }}
            />
            {canResolve ? (
              <QuickActionButton
                label="Resolver"
                title="Resolver ticket"
                icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQuickAction('resolve');
                }}
              />
            ) : null}
            {canAssignToMe ? (
              <QuickActionButton
                label="Atribuir a mim"
                title="Atribuir a mim"
                icon={<UserPlus className="h-3.5 w-3.5" aria-hidden />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onQuickAction('assign');
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});
