import type { TicketStatus } from '@/types/tickets';
import { ticketStatusLabels } from '@/types/tickets';

/** Ticket fechado: sem edição de campos. */
export function isTicketClosedLocked(status: TicketStatus): boolean {
  return status === 'closed';
}

/** Pode usar ação "Reabrir" (resolved → open). */
export function canReopenTicket(status: TicketStatus): boolean {
  return status === 'resolved';
}

const ACTIVE_STATUSES: TicketStatus[] = [
  'new',
  'open',
  'pending',
  'waiting_customer',
  'in_progress',
  'resolved',
];

/** Opções de status no select administrativo. */
export function getEditableStatusOptions(current: TicketStatus): TicketStatus[] {
  if (current === 'closed') return ['closed'];
  if (current === 'cancelled') return ['cancelled'];
  if (current === 'resolved') {
    return ['resolved', 'open', 'waiting_customer', 'closed'];
  }
  return ACTIVE_STATUSES.filter((s) => s !== 'cancelled' || current === 'cancelled');
}

export function statusOptionLabel(status: TicketStatus, current: TicketStatus): string {
  if (status === 'open' && current === 'resolved') {
    return `${ticketStatusLabels.open} (reabrir)`;
  }
  return ticketStatusLabels[status];
}
