import type { Ticket } from '@/types/tickets';

export type TicketSlaTone = 'ok' | 'warning' | 'overdue' | 'neutral';

/** Cor do tempo (SLA de resolução simplificado). */
export function getTicketSlaTone(ticket: Ticket): TicketSlaTone {
  if (!ticket.resolution_due_at) return 'neutral';
  const due = new Date(ticket.resolution_due_at).getTime();
  const now = Date.now();
  if (due < now) return 'overdue';
  const hoursLeft = (due - now) / (1000 * 60 * 60);
  if (hoursLeft < 2) return 'warning';
  return 'ok';
}

export const ticketSlaTimeClass: Record<TicketSlaTone, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400 font-medium',
  overdue: 'text-destructive font-medium',
  neutral: 'text-muted-foreground',
};

/** Ainda sem primeira resposta pública da equipe. */
export function ticketHasNoSupportResponse(ticket: Ticket): boolean {
  return !ticket.first_response_at;
}

/** Última mensagem pública foi do cliente. */
export function ticketAwaitingSupport(ticket: Ticket): boolean {
  return ticket.last_message_author_role === 'customer';
}

export function isTicketSlaOverdue(ticket: Ticket): boolean {
  return getTicketSlaTone(ticket) === 'overdue';
}

/** SLA vencido primeiro; depois mais recentes. */
export function sortTicketsInKanbanColumn(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => {
    const aCrit = isTicketSlaOverdue(a) ? 1 : 0;
    const bCrit = isTicketSlaOverdue(b) ? 1 : 0;
    if (aCrit !== bCrit) return bCrit - aCrit;
    const aTs = new Date(a.updated_at || a.created_at).getTime();
    const bTs = new Date(b.updated_at || b.created_at).getTime();
    return bTs - aTs;
  });
}
