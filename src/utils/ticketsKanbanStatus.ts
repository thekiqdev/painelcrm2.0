import type { Ticket, TicketStatus } from '@/types/tickets';
import { ticketStatusLabels } from '@/types/tickets';

/** Status exibidos no Kanban (1:1 com colunas, sem agrupamento). */
export const TICKETS_KANBAN_STATUSES: TicketStatus[] = [
  'new',
  'open',
  'waiting_customer',
  'resolved',
  'closed',
];

export type TicketsKanbanColumnId = (typeof TICKETS_KANBAN_STATUSES)[number];

export const TICKETS_KANBAN_COLUMNS: { id: TicketsKanbanColumnId; label: string }[] =
  TICKETS_KANBAN_STATUSES.map((id) => ({
    id,
    label: ticketStatusLabels[id],
  }));

/** Cor do indicador da coluna (hex, alinhado ao Kanban de leads). */
export const ticketKanbanColumnDotColors: Record<TicketsKanbanColumnId, string> = {
  new: '#3b82f6',
  open: '#22c55e',
  waiting_customer: '#f97316',
  resolved: '#10b981',
  closed: '#6b7280',
};

export type TicketKanbanColumnDef = {
  id: TicketsKanbanColumnId;
  name: string;
  label: string;
  color: string;
};

export const TICKET_KANBAN_COLUMN_DEFS: TicketKanbanColumnDef[] = TICKETS_KANBAN_COLUMNS.map(
  (c) => ({
    id: c.id,
    name: c.id,
    label: c.label,
    color: ticketKanbanColumnDotColors[c.id],
  })
);

export function ticketKanbanColumn(ticket: Ticket): TicketsKanbanColumnId | null {
  if (TICKETS_KANBAN_STATUSES.includes(ticket.status as TicketsKanbanColumnId)) {
    return ticket.status as TicketsKanbanColumnId;
  }
  return null;
}

export function isTicketOnKanban(ticket: Ticket): boolean {
  return ticketKanbanColumn(ticket) !== null;
}
