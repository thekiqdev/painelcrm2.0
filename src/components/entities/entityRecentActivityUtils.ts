import { formatQuickViewDate } from "./entityQuickViewLayout";

export type RecentActivityKind = "message" | "ticket" | "invoice" | "created";

export type RecentActivityItem = {
  label: string;
  date: string;
  kind: RecentActivityKind;
};

export type EntityRecentActivitySource = {
  entityKind: "client" | "lead";
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  conversation_id?: string | null;
  whatsapp_avatar_url?: string | null;
  tickets?: Array<{
    id?: string;
    ticket_number?: string;
    created_at?: string;
  }> | null;
  invoices?: Array<{
    id?: string;
    created_at?: string;
  }> | null;
};

export function hasLinkedConversation(source: EntityRecentActivitySource): boolean {
  return Boolean(
    source.last_message_at?.trim() ||
      source.conversation_id?.trim() ||
      source.whatsapp_avatar_url?.trim(),
  );
}

export function buildRecentActivities(source: EntityRecentActivitySource): RecentActivityItem[] {
  const activities: RecentActivityItem[] = [];

  const messageDate =
    source.last_message_at?.trim() ||
    (hasLinkedConversation(source) ? source.updated_at?.trim() : null);
  if (messageDate) {
    activities.push({
      label: "Mensagem recente",
      date: messageDate,
      kind: "message",
    });
  }

  const ticket = source.tickets?.[0];
  if (ticket) {
    const ref = ticket.ticket_number?.trim() || ticket.id?.slice(0, 8);
    const ticketDate =
      ticket.created_at?.trim() || source.updated_at?.trim() || source.created_at?.trim();
    if (ticketDate) {
      activities.push({
        label: ref ? `Ticket aberto (#${ref})` : "Ticket aberto",
        date: ticketDate,
        kind: "ticket",
      });
    }
  }

  const invoice = source.invoices?.[0];
  if (invoice) {
    const invoiceDate =
      invoice.created_at?.trim() || source.updated_at?.trim() || source.created_at?.trim();
    if (invoiceDate) {
      activities.push({
        label: "Fatura gerada",
        date: invoiceDate,
        kind: "invoice",
      });
    }
  }

  if (source.created_at?.trim()) {
    activities.push({
      label: source.entityKind === "client" ? "Cliente cadastrado" : "Lead cadastrado",
      date: source.created_at,
      kind: "created",
    });
  }

  return activities
    .filter((a) => a.date && !Number.isNaN(new Date(a.date).getTime()))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);
}

export function formatActivityDate(iso: string): string | null {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(d);
    }
    if (diffDays < 7) {
      return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric" }).format(d);
    }
    return formatQuickViewDate(iso);
  } catch {
    return null;
  }
}
